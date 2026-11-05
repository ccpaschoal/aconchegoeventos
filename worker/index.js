/* Aconchego · API de reservas (Cloudflare Worker + D1). O resto do site sai da pasta dist.
   GET  /api/disponibilidade?mes=AAAA-MM   dias do mês com estado e preço (sem dados de clientes)
   POST /api/criar-reserva                 { inicio, dias, nome, whatsapp, convidados } → init_point do Mercado Pago
   POST /api/webhook-mp                    notificação do Mercado Pago
   GET/POST /api/admin                     painel da dona (senha em ADMIN_PASSWORD) */
import {
  MIN_SEGURA, RE_MES, RE_ID, json, hojeSP, isoSP, dataValida, somaDias, somaMeses, fimDoMes, intervalo, dataBR,
  lerConfig, lerAjustes, lerOcupacao, montarDia, calcularPreco, situacao, novoId, CONFIG_PADRAO,
} from './regras.js';
import {
  modoMP, criarPreferencia, buscarPagamento, assinaturaValida, iguais, enviarEmail, enviarWhatsApp, textoAlerta, titulo, quando, enviarNtfy,
} from './servicos.js';

/* Sem Access Token do Mercado Pago, a reserva vira um pedido pelo WhatsApp do salão (a data fica guardada por HORAS_PEDIDO) */
const temMP = (env) => !!(modoMP(env) === 'teste' ? env.MP_ACCESS_TOKEN_TESTE : env.MP_ACCESS_TOKEN);
const HORAS_PEDIDO = 24;
const MAX_ABERTOS_POR_PESSOA = 3;     // pedidos/pagamentos em aberto ao mesmo tempo, por conexão
const MAX_TENTATIVAS_SENHA = 10;      // erros de senha do painel em 15 minutos

/* Resumo do IP (SHA-256): serve para limitar abusos sem guardar o endereço de ninguém */
async function ipHash(req) {
  const ip = req.headers.get('CF-Connecting-IP') || req.headers.get('X-Forwarded-For') || 'local';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`aconchego:${ip}`));
  return [...new Uint8Array(bytes)].slice(0, 16).map((b) => b.toString(16).padStart(2, '0')).join('');
}

const ORIGENS = ['https://ccpaschoal.github.io']; // versão do GitHub Pages também usa esta API
const cors = (req) => {
  const o = req.headers.get('Origin');
  return ORIGENS.includes(o) ? { 'Access-Control-Allow-Origin': o, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', Vary: 'Origin' } : {};
};
const OCUPADO = 'Essa data acabou de ser reservada por outra pessoa. Escolha outra data.';

/* ── Disponibilidade ── */
async function disponibilidade(req, env) {
  const agora = Date.now();
  const hoje = hojeSP(agora);
  const pedido = new URL(req.url).searchParams.get('mes');
  const mes = RE_MES.test(pedido || '') ? pedido : hoje.slice(0, 7);
  const de = `${mes}-01`, ate = fimDoMes(mes);
  const [config, ajustes, ocupacao] = await Promise.all([lerConfig(env.DB), lerAjustes(env.DB, de, ate), lerOcupacao(env.DB, de, ate, agora)]);
  const dias = intervalo(de, ate).map((data) => {
    const d = montarDia(data, { config, ajustes, ocupacao, hoje });
    const status = d.status === 'livre' ? 'disponivel' : d.status === 'fechado' ? 'indisponivel' : 'reservado';
    return status === 'disponivel' ? { data, status, preco: d.preco, feriado: d.feriado, especial: d.especial } : { data, status };
  });
  return json({
    mes, hoje, de: hoje.slice(0, 7), ate: somaMeses(hoje.slice(0, 7), config.mesesAFrente),
    maxConvidados: config.maxConvidados, maxDias: config.maxDias, precoPacote: config.precoPacote,
    pagamento: temMP(env) ? 'mercadopago' : 'whatsapp', horasPedido: HORAS_PEDIDO, dias,
  }, 200, cors(req));
}

/* ── Criar reserva ── */
async function criarReserva(req, env, ctx) {
  const h = cors(req);
  let b;
  try { b = await req.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400, h); }
  if (b?.site) return json({ erro: 'Dados inválidos.' }, 400, h); // campo-isca contra robôs
  const inicio = String(b.inicio || '');
  const nDias = Number(b.dias);
  const nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
  let whatsapp = String(b.whatsapp || '').replace(/\D/g, '');
  if (whatsapp.length >= 12 && whatsapp.startsWith('55')) whatsapp = whatsapp.slice(2);
  const convidados = Number(b.convidados);
  if (!dataValida(inicio)) return json({ erro: 'Escolha uma data válida.' }, 400, h);
  if (nome.length < 3 || nome.length > 80) return json({ erro: 'Informe seu nome.' }, 400, h);
  if (!/^[1-9]{2}9?\d{8}$/.test(whatsapp)) return json({ erro: 'Informe o WhatsApp com DDD.' }, 400, h);

  const db = env.DB;
  const config = await lerConfig(db);
  if (!Number.isInteger(nDias) || nDias < 1 || nDias > config.maxDias) return json({ erro: `Escolha de 1 a ${config.maxDias} dias.` }, 400, h);
  if (!Number.isInteger(convidados) || convidados < 1 || convidados > config.maxConvidados) {
    return json({ erro: `Informe de 1 a ${config.maxConvidados} convidados.` }, 400, h);
  }
  const agora = Date.now();
  const hoje = hojeSP(agora);
  const fim = somaDias(inicio, nDias - 1);
  const datas = intervalo(inicio, fim);
  const ip = await ipHash(req);

  // Evita que alguém segure a agenda inteira com pedidos falsos
  const abertos = (await db.prepare(`SELECT COUNT(*) AS n FROM reservas WHERE ip_hash = ? AND status IN ('pendente', 'pedido') AND expira_em > ?`)
    .bind(ip, agora).first()).n;

  // A mesma pessoa tentando de novo (voltou do erro do cartão) não fica presa na própria reserva pendente.
  // Precisa ser o mesmo WhatsApp E a mesma conexão, para ninguém derrubar o pedido de outra pessoa digitando o número dela.
  const { results: minhas } = await db.prepare(`SELECT DISTINCT r.id FROM reservas r JOIN ocupacao o ON o.reserva_id = r.id
    WHERE r.status IN ('pendente', 'pedido') AND r.whatsapp = ? AND r.ip_hash = ? AND o.expira_em > ? AND o.data BETWEEN ? AND ?`)
    .bind(whatsapp, ip, agora, inicio, fim).all();
  if (abertos - minhas.length >= MAX_ABERTOS_POR_PESSOA) {
    return json({ erro: 'Você já tem pedidos em aberto. Fale com a gente pelo WhatsApp para alterar.' }, 429, h);
  }
  if (minhas.length) {
    await db.batch(minhas.flatMap(({ id }) => [
      db.prepare("UPDATE reservas SET status = 'substituida' WHERE id = ?").bind(id),
      db.prepare('DELETE FROM ocupacao WHERE reserva_id = ?').bind(id),
    ]));
  }

  const [ajustes, ocupacao] = await Promise.all([lerAjustes(db, inicio, fim), lerOcupacao(db, inicio, fim, agora)]);
  const dias = datas.map((data) => montarDia(data, { config, ajustes, ocupacao, hoje }));
  if (dias.some((d) => d.status !== 'livre')) return json({ erro: OCUPADO }, 409, h);
  const { total, detalhe } = calcularPreco(dias, config);
  if (!(total > 0)) return json({ erro: 'Data sem preço definido.' }, 409, h);

  const id = novoId(inicio);
  const pedido = !temMP(env);
  const expira = agora + (pedido ? HORAS_PEDIDO * 3600e3 : MIN_SEGURA * 60e3);
  // Tudo ou nada: a chave primária de ocupacao.data impede duas reservas no mesmo dia
  try {
    await db.batch([
      db.prepare(`DELETE FROM ocupacao WHERE data BETWEEN ? AND ? AND expira_em IS NOT NULL AND expira_em <= ?`).bind(inicio, fim, agora),
      ...datas.map((d) => db.prepare('INSERT INTO ocupacao (data, reserva_id, expira_em) VALUES (?, ?, ?)').bind(d, id, expira)),
      db.prepare(`INSERT INTO reservas (id, inicio, fim, datas, nome, whatsapp, convidados, valor, detalhe, status, criada_em, expira_em, ambiente, ip_hash)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, inicio, fim, JSON.stringify(datas), nome, whatsapp, convidados, total, detalhe,
          pedido ? 'pedido' : 'pendente', agora, expira, pedido ? 'whatsapp' : modoMP(env), ip),
    ]);
  } catch (e) {
    if (/UNIQUE|constraint/i.test(e?.message || '')) return json({ erro: OCUPADO }, 409, h);
    throw e;
  }

  if (pedido) {
    const r = await db.prepare('SELECT * FROM reservas WHERE id = ?').bind(id).first();
    ctx.waitUntil(avisar(env, r).catch((e) => console.error('avisar:', e.message)));
    const texto = [
      'Olá! Quero reservar o Aconchego:',
      `${quando(r)} · ${nDias} ${nDias === 1 ? 'diária' : 'diárias'}`,
      `Valor: R$ ${total.toFixed(2).replace('.', ',')} (${detalhe})`,
      `Nome: ${nome}`,
      `Convidados: ${convidados}`,
      `Código: ${id}`,
    ].join('\n');
    const wa = `https://wa.me/${String(env.WHATSAPP_SALAO || '5562994127148').replace(/\D/g, '')}?text=${encodeURIComponent(texto)}`;
    return json({ id, whatsapp: wa, expiraEm: new Date(expira).toISOString(), valor: total }, 200, h);
  }

  const base = (env.SITE_URL || new URL(req.url).origin).replace(/\/$/, '');
  const periodo = nDias === 1 ? dataBR(inicio) : `${dataBR(inicio)} a ${dataBR(fim)}`;
  try {
    const pref = await criarPreferencia(env, {
      items: [{
        id: 'diaria',
        title: `Reserva Aconchego · ${periodo}`,
        description: `${nDias} ${nDias === 1 ? 'diária' : 'diárias'} · ${convidados} convidados`,
        quantity: 1,
        unit_price: total,
        currency_id: 'BRL',
      }],
      payer: { name: nome },
      external_reference: id,
      notification_url: `${base}/api/webhook-mp?source_news=webhooks`,
      back_urls: { success: `${base}/sucesso`, pending: `${base}/pendente`, failure: `${base}/erro` },
      auto_return: 'approved',
      // O link e o Pix vencem junto com a reserva pendente; boleto fica de fora porque demora dias
      expires: true,
      expiration_date_from: isoSP(agora - 60e3),
      expiration_date_to: isoSP(expira),
      date_of_expiration: isoSP(expira),
      payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 12 },
      statement_descriptor: 'ACONCHEGO',
      metadata: { reserva_id: id },
    }, id);
    return json({ id, init_point: pref.init_point, expiraEm: new Date(expira).toISOString(), valor: total }, 200, h);
  } catch (e) {
    console.error('Mercado Pago:', e?.message, JSON.stringify(e?.detalhe || ''));
    await db.batch([
      db.prepare('DELETE FROM ocupacao WHERE reserva_id = ?').bind(id),
      db.prepare('DELETE FROM reservas WHERE id = ?').bind(id),
    ]);
    return json({ erro: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.' }, 502, h);
  }
}

/* ── Webhook do Mercado Pago ── */
async function avisar(env, r) {
  const chave = `${r.id}_${r.status}`;
  const trava = await env.DB.prepare('INSERT INTO alertas (chave, em) VALUES (?, ?) ON CONFLICT(chave) DO NOTHING').bind(chave, Date.now()).run();
  if (!trava.meta.changes) return; // já avisado
  const valor = `R$ ${Number(r.valor_pago ?? r.valor).toFixed(2).replace('.', ',')}`;
  await env.DB.prepare('INSERT INTO avisos (chave, em, tipo, texto, reserva_id) VALUES (?, ?, ?, ?, ?) ON CONFLICT(chave) DO NOTHING')
    .bind(chave, Date.now(), r.status, `${titulo(r)}\n${r.nome} · ${quando(r)} · ${valor}${r.whatsapp ? ` · WhatsApp ${r.whatsapp}` : ''}`, r.id).run();
  const canais = await Promise.all([enviarEmail(env, r), enviarWhatsApp(env, textoAlerta(r)), enviarNtfy(env, r)]);
  console.log('alertas', r.id, canais);
  if (!canais.includes(true) && canais.includes(false)) {
    await env.DB.prepare('DELETE FROM alertas WHERE chave = ?').bind(chave).run();
    throw new Error('Nenhum alerta foi enviado'); // o MP reenvia mais tarde
  }
}

async function webhook(req, env) {
  const url = new URL(req.url);
  let corpo = {};
  try { corpo = JSON.parse((await req.text()) || '{}'); } catch { /* corpo vazio */ }
  const tipo = corpo.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const pagamentoId = url.searchParams.get('data.id') || corpo?.data?.id;
  if (tipo !== 'payment' || !pagamentoId) return new Response('ignorado');
  if (!(await assinaturaValida(env, req.headers, pagamentoId))) {
    console.warn('webhook: assinatura inválida', pagamentoId);
    return new Response('assinatura inválida', { status: 401 });
  }
  let pg;
  try { pg = await buscarPagamento(env, pagamentoId); } catch (e) {
    if (e.status === 404) return new Response('pagamento não encontrado'); // ex.: simulação do painel
    console.error('webhook: consulta', e?.message);
    return new Response('erro', { status: 500 });
  }
  const id = String(pg.external_reference || '');
  if (!RE_ID.test(id)) return new Response('sem reserva');
  const db = env.DB;
  let r = await db.prepare('SELECT * FROM reservas WHERE id = ?').bind(id).first();
  if (!r) return new Response('reserva não encontrada');
  const agora = Date.now();

  if (pg.status === 'approved') {
    if (!['paga', 'conflito'].includes(r.status)) {
      const datas = JSON.parse(r.datas);
      let pegou = 0;
      if (r.status !== 'cancelada') {
        // Confirma os dias: tira pendências vencidas de outras pessoas e firma os dias que ainda são desta reserva ou estão livres
        await db.batch([
          db.prepare(`DELETE FROM ocupacao WHERE data BETWEEN ? AND ? AND reserva_id <> ? AND expira_em IS NOT NULL AND expira_em <= ?`).bind(r.inicio, r.fim, id, agora),
          ...datas.map((d) => db.prepare(`INSERT INTO ocupacao (data, reserva_id, expira_em) VALUES (?, ?, NULL)
            ON CONFLICT(data) DO UPDATE SET expira_em = NULL WHERE ocupacao.reserva_id = excluded.reserva_id`).bind(d, id)),
        ]);
        pegou = (await db.prepare('SELECT COUNT(*) AS n FROM ocupacao WHERE reserva_id = ? AND expira_em IS NULL').bind(id).first()).n;
      }
      const valorOk = Number(pg.transaction_amount) + 0.009 >= Number(r.valor);
      const status = pegou === datas.length && valorOk ? 'paga' : 'conflito';
      const obs = !valorOk ? 'Valor pago menor que o da reserva' : status === 'conflito' ? 'Data ocupada por outra reserva quando o pagamento chegou' : r.obs;
      const stmts = [db.prepare(`UPDATE reservas SET status = ?, pago_em = ?, pagamento_id = ?, metodo = ?, valor_pago = ?, obs = ? WHERE id = ?`)
        .bind(status, agora, String(pg.id), pg.payment_type_id || null, pg.transaction_amount ?? null, obs ?? null, id)];
      if (status === 'conflito') stmts.push(db.prepare('DELETE FROM ocupacao WHERE reserva_id = ?').bind(id));
      await db.batch(stmts);
      r = await db.prepare('SELECT * FROM reservas WHERE id = ?').bind(id).first();
    }
    try { await avisar(env, r); } catch (e) { console.error(e.message); return new Response('erro', { status: 500 }); }
  } else if (['refunded', 'charged_back', 'cancelled'].includes(pg.status) && r.status === 'paga' && r.pagamento_id === String(pg.id)) {
    await db.batch([
      db.prepare("UPDATE reservas SET status = 'estornada' WHERE id = ?").bind(id),
      db.prepare('DELETE FROM ocupacao WHERE reserva_id = ?').bind(id), // a data volta a ficar livre
    ]);
  }
  return new Response('ok');
}

/* ── Admin ── */
async function admin(req, env) {
  if (!env.ADMIN_PASSWORD) return json({ erro: 'Configure o segredo ADMIN_PASSWORD na Cloudflare.' }, 503);
  const db = env.DB;
  const ip = await ipHash(req);
  const agoraSenha = Date.now();
  const erros = (await db.prepare('SELECT COUNT(*) AS n FROM tentativas WHERE ip_hash = ? AND em > ?').bind(ip, agoraSenha - 15 * 60e3).first()).n;
  if (erros >= MAX_TENTATIVAS_SENHA) return json({ erro: 'Muitas tentativas. Espere 15 minutos e tente de novo.' }, 429);
  let dada = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
  try { dada = decodeURIComponent(dada); } catch { dada = ''; }
  if (!iguais(dada, String(env.ADMIN_PASSWORD).trim())) {
    await db.batch([
      db.prepare('INSERT INTO tentativas (ip_hash, em) VALUES (?, ?)').bind(ip, agoraSenha),
      db.prepare('DELETE FROM tentativas WHERE em < ?').bind(agoraSenha - 864e5),
    ]);
    await new Promise((r) => setTimeout(r, 800)); // atrasa quem tenta adivinhar
    return json({ erro: 'Senha incorreta.' }, 401);
  }
  if (req.method === 'GET') {
    const agora = Date.now();
    const hoje = hojeSP(agora);
    const pedido = new URL(req.url).searchParams.get('mes');
    const mes = RE_MES.test(pedido || '') ? pedido : hoje.slice(0, 7);
    const de = `${mes}-01`, ate = fimDoMes(mes);
    const [config, ajustes, ocupacao, lista, avisos] = await Promise.all([
      lerConfig(db), lerAjustes(db, de, ate), lerOcupacao(db, de, ate, agora),
      db.prepare('SELECT * FROM reservas WHERE fim >= ? ORDER BY inicio, criada_em').bind(somaDias(hoje, -30)).all(),
      db.prepare('SELECT * FROM avisos ORDER BY em DESC LIMIT 50').all(),
    ]);
    return json({
      mes, hoje, config, avisos: avisos.results, pagamento: temMP(env) ? 'mercadopago' : 'whatsapp',
      dias: intervalo(de, ate).map((data) => montarDia(data, { config, ajustes, ocupacao, hoje, admin: true })),
      reservas: lista.results.map((r) => ({ ...r, situacao: situacao(r, agora) })),
    });
  }
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  const dinheiro = (v) => { const n = Math.round(Number(v) * 100) / 100; return Number.isFinite(n) && n >= 0 && n <= 100000 ? n : null; };
  const inteiro = (v, min, max, padrao) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };

  if (b.acao === 'config') {
    const c = b.config || {};
    const precos = ['precoDiaria', 'precoFeriado', 'precoPacote'].map((k) => dinheiro(c[k]));
    if (precos.includes(null)) return json({ erro: 'Confira os preços.' }, 400);
    const config = {
      precoDiaria: precos[0], precoFeriado: precos[1], precoPacote: precos[2],
      semana: Array.from({ length: 7 }, (_, i) => !!c.semana?.[i]),
      antecedenciaDias: inteiro(c.antecedenciaDias, 0, 365, CONFIG_PADRAO.antecedenciaDias),
      mesesAFrente: inteiro(c.mesesAFrente, 1, 24, CONFIG_PADRAO.mesesAFrente),
      maxConvidados: inteiro(c.maxConvidados, 1, 5000, CONFIG_PADRAO.maxConvidados),
      maxDias: inteiro(c.maxDias, 1, 7, CONFIG_PADRAO.maxDias),
    };
    await db.prepare("INSERT INTO config (chave, valor) VALUES ('geral', ?) ON CONFLICT(chave) DO UPDATE SET valor = excluded.valor").bind(JSON.stringify(config)).run();
    return json({ ok: true });
  }

  if (b.acao === 'dia') {
    if (!dataValida(b.data)) return json({ erro: 'Data inválida.' }, 400);
    const tri = (v) => (v === true ? 1 : v === false ? 0 : null);
    let preco = null;
    if (b.preco !== null && b.preco !== undefined && b.preco !== '') {
      preco = dinheiro(b.preco);
      if (preco === null) return json({ erro: 'Preço inválido.' }, 400);
    }
    const aberto = tri(b.aberto), feriado = tri(b.feriado);
    if (aberto === null && feriado === null && preco === null) await db.prepare('DELETE FROM dias WHERE data = ?').bind(b.data).run();
    else {
      await db.prepare(`INSERT INTO dias (data, aberto, feriado, preco) VALUES (?, ?, ?, ?)
        ON CONFLICT(data) DO UPDATE SET aberto = excluded.aberto, feriado = excluded.feriado, preco = excluded.preco`).bind(b.data, aberto, feriado, preco).run();
    }
    return json({ ok: true });
  }

  if (b.acao === 'bloquear') {
    if (!dataValida(b.inicio)) return json({ erro: 'Data inválida.' }, 400);
    const n = inteiro(b.dias, 1, 14, 1);
    const fim = somaDias(b.inicio, n - 1);
    const datas = intervalo(b.inicio, fim);
    const id = novoId(b.inicio);
    const agora = Date.now();
    try {
      await db.batch([
        db.prepare('DELETE FROM ocupacao WHERE data BETWEEN ? AND ? AND expira_em IS NOT NULL AND expira_em <= ?').bind(b.inicio, fim, agora),
        ...datas.map((d) => db.prepare('INSERT INTO ocupacao (data, reserva_id, expira_em) VALUES (?, ?, NULL)').bind(d, id)),
        db.prepare(`INSERT INTO reservas (id, inicio, fim, datas, nome, whatsapp, convidados, valor, status, criada_em, obs)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'bloqueio', ?, ?)`).bind(id, b.inicio, fim, JSON.stringify(datas),
          String(b.nome || 'Reserva pelo WhatsApp').trim().slice(0, 80) || 'Reserva pelo WhatsApp',
          String(b.whatsapp || '').replace(/\D/g, '').slice(-11), inteiro(b.convidados, 0, 5000, 0) || null,
          dinheiro(b.valor || 0) ?? 0, agora, String(b.obs || '').slice(0, 200)),
      ]);
    } catch (e) {
      if (/UNIQUE|constraint/i.test(e?.message || '')) return json({ erro: 'Já existe reserva em algum desses dias.' }, 409);
      throw e;
    }
    return json({ ok: true, id });
  }

  if (b.acao === 'lidos') {
    await db.prepare('UPDATE avisos SET lido = 1 WHERE lido = 0').run();
    return json({ ok: true });
  }

  // Pedido acertado com o cliente pelo WhatsApp: os dias ficam reservados de vez
  if (b.acao === 'confirmar') {
    if (!RE_ID.test(b.id || '')) return json({ erro: 'Reserva inválida.' }, 400);
    const r = await db.prepare('SELECT * FROM reservas WHERE id = ?').bind(b.id).first();
    if (!r || !['pedido', 'pendente'].includes(r.status)) return json({ erro: 'Só dá para confirmar pedidos em aberto.' }, 400);
    const agora = Date.now();
    const datas = JSON.parse(r.datas);
    await db.batch([
      db.prepare('DELETE FROM ocupacao WHERE data BETWEEN ? AND ? AND reserva_id <> ? AND expira_em IS NOT NULL AND expira_em <= ?').bind(r.inicio, r.fim, r.id, agora),
      ...datas.map((d) => db.prepare(`INSERT INTO ocupacao (data, reserva_id, expira_em) VALUES (?, ?, NULL)
        ON CONFLICT(data) DO UPDATE SET expira_em = NULL WHERE ocupacao.reserva_id = excluded.reserva_id`).bind(d, r.id)),
    ]);
    const n = (await db.prepare('SELECT COUNT(*) AS n FROM ocupacao WHERE reserva_id = ? AND expira_em IS NULL').bind(r.id).first()).n;
    if (n !== datas.length) {
      await db.prepare('UPDATE ocupacao SET expira_em = ? WHERE reserva_id = ?').bind(r.expira_em, r.id).run();
      return json({ erro: 'Algum desses dias já foi reservado por outra pessoa.' }, 409);
    }
    await db.prepare("UPDATE reservas SET status = 'confirmada', expira_em = NULL WHERE id = ?").bind(r.id).run();
    return json({ ok: true });
  }

  if (b.acao === 'cancelar') {
    if (!RE_ID.test(b.id || '')) return json({ erro: 'Reserva inválida.' }, 400);
    const r = await db.prepare('SELECT status FROM reservas WHERE id = ?').bind(b.id).first();
    if (!r) return json({ erro: 'Reserva não encontrada.' }, 404);
    await db.batch([
      db.prepare('DELETE FROM ocupacao WHERE reserva_id = ?').bind(b.id),
      r.status === 'bloqueio'
        ? db.prepare('DELETE FROM reservas WHERE id = ?').bind(b.id)
        : db.prepare("UPDATE reservas SET status = 'cancelada' WHERE id = ?").bind(b.id),
    ]);
    return json({ ok: true });
  }
  return json({ erro: 'Ação desconhecida.' }, 400);
}

/* ── Roteamento ── */
const ROTAS = {
  'GET /api/disponibilidade': disponibilidade,
  'POST /api/criar-reserva': criarReserva,
  'POST /api/webhook-mp': webhook,
  'GET /api/admin': admin,
  'POST /api/admin': admin,
};

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(req);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(req) });
    const rota = ROTAS[`${req.method} ${url.pathname.replace(/\/$/, '')}`];
    if (!rota) return json({ erro: 'Não encontrado.' }, 404);
    try {
      const resp = await rota(req, env, ctx);
      for (const [k, v] of Object.entries(cors(req))) resp.headers.set(k, v);
      return resp;
    } catch (e) {
      console.error(url.pathname, e?.stack || e);
      return json({ erro: 'Erro no servidor. Tente de novo.' }, 500, cors(req));
    }
  },
  // Uma vez por dia limpa pendências vencidas (a agenda já ignora as vencidas)
  async scheduled(_evento, env) {
    await env.DB.prepare('DELETE FROM ocupacao WHERE expira_em IS NOT NULL AND expira_em <= ?').bind(Date.now()).run();
  },
};
