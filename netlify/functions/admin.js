/* /api/admin · painel da dona (senha em ADMIN_PASSWORD, conferida só aqui no servidor)
   GET  ?mes=AAAA-MM            → configuração, dias do mês com detalhes e lista de reservas
   POST { acao: 'config', config }                        → períodos, preços padrão, dias da semana...
   POST { acao: 'dia', data, aberto, periodos }           → exceção de uma data (abrir/fechar, preço de feriado)
   POST { acao: 'bloquear', data, periodo, nome, ... }    → reserva fechada por fora (WhatsApp)
   POST { acao: 'cancelar', id }                          → cancela reserva / libera bloqueio */
import crypto from 'node:crypto';
import {
  RE_MES, RE_ID, RE_PERIODO, json, hojeSP, somaDias, diasDoMes, dataValida, lerConfig, lerExcecoes,
  listarReservas, lojaAgenda, lojaReservas, montarDia, situacao, ocupa, conflita,
} from '../lib/comum.js';

const hash = (s) => crypto.createHash('sha256').update(String(s)).digest();
function senhaOk(cabecalho, senha) {
  let dada = (cabecalho || '').replace(/^Bearer\s+/i, '');
  try { dada = decodeURIComponent(dada); } catch { return false; }
  return crypto.timingSafeEqual(hash(dada), hash(senha));
}
const espera = (ms) => new Promise((r) => setTimeout(r, ms));
const preco = (v) => Math.round(Number(v) * 100) / 100;
const precoValido = (p) => Number.isFinite(p) && p >= 0 && p <= 100000;
const slug = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'periodo';

async function painel(pedido) {
  const agora = Date.now();
  const hoje = hojeSP(agora);
  const mes = RE_MES.test(pedido || '') ? pedido : hoje.slice(0, 7);
  const corte = somaDias(hoje, -30);
  const [config, excecoes, doMes, recentes] = await Promise.all([
    lerConfig(), lerExcecoes(mes), listarReservas(mes), listarReservas('', (k) => k >= corte),
  ]);
  const dias = diasDoMes(mes).map((d) => montarDia(d, { config, excecoes, reservas: doMes, hoje, agora, admin: true }));
  const reservas = recentes
    .map((r) => ({ ...r, situacao: situacao(r, agora) }))
    .sort((a, b) => a.data.localeCompare(b.data) || a.criadaEm.localeCompare(b.criadaEm));
  return { mes, hoje, config, dias, reservas };
}

function validarConfig(c) {
  if (!c || !Array.isArray(c.periodos) || !c.periodos.length || c.periodos.length > 8) return 'Cadastre de 1 a 8 períodos.';
  const ids = new Set();
  const periodos = [];
  for (const p of c.periodos) {
    const nome = String(p?.nome || '').trim().slice(0, 30);
    if (!nome) return 'Todo período precisa de um nome.';
    const id = RE_PERIODO.test(p.id || '') ? p.id : slug(nome);
    if (ids.has(id)) return `Período repetido: ${nome}.`;
    ids.add(id);
    const v = preco(p.preco || 0);
    if (!precoValido(v)) return `Preço inválido em ${nome}.`;
    periodos.push({ id, nome, horario: String(p.horario || '').trim().slice(0, 30), preco: v, diaInteiro: !!p.diaInteiro });
  }
  const inteiro = (v, min, max, padrao) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : padrao; };
  return {
    periodos,
    semana: Array.from({ length: 7 }, (_, i) => !!c.semana?.[i]),
    antecedenciaDias: inteiro(c.antecedenciaDias, 0, 365, 1),
    mesesAFrente: inteiro(c.mesesAFrente, 1, 24, 12),
    maxConvidados: inteiro(c.maxConvidados, 1, 5000, 100),
  };
}

async function salvarDia(b) {
  if (!dataValida(b.data)) return json({ erro: 'Data inválida.' }, 400);
  const mes = b.data.slice(0, 7);
  const excecoes = await lerExcecoes(mes);
  const novo = {};
  if (b.aberto === true || b.aberto === false) novo.aberto = b.aberto;
  const periodos = {};
  for (const [id, v] of Object.entries(b.periodos || {})) {
    if (!RE_PERIODO.test(id)) continue;
    const e = {};
    if (v?.fechado) e.fechado = true;
    if (v?.preco !== null && v?.preco !== undefined && v?.preco !== '') {
      const p = preco(v.preco);
      if (!precoValido(p)) return json({ erro: 'Preço inválido.' }, 400);
      e.preco = p;
    }
    if (Object.keys(e).length) periodos[id] = e;
  }
  if (Object.keys(periodos).length) novo.periodos = periodos;
  if (Object.keys(novo).length) excecoes[b.data] = novo; else delete excecoes[b.data];
  await lojaAgenda().setJSON(`excecoes/${mes}`, excecoes);
  return json({ ok: true });
}

async function bloquear(b) {
  if (!dataValida(b.data)) return json({ erro: 'Data inválida.' }, 400);
  const config = await lerConfig();
  const p = config.periodos.find((x) => x.id === b.periodo);
  if (!p) return json({ erro: 'Período inválido.' }, 400);
  const agora = Date.now();
  const ocupado = (await listarReservas(`${b.data}_`)).some((r) => ocupa(r, agora) && conflita(r.periodo, p.id, config.periodos));
  if (ocupado) return json({ erro: 'Já existe reserva nesse dia e período.' }, 409);
  const id = `${b.data}_${crypto.randomBytes(6).toString('hex')}`;
  const valor = preco(b.valor || 0);
  await lojaReservas().setJSON(id, {
    id, data: b.data, periodo: p.id, periodoNome: p.nome, horario: p.horario,
    valor: precoValido(valor) ? valor : 0,
    nome: String(b.nome || 'Reserva pelo WhatsApp').trim().slice(0, 80),
    whatsapp: String(b.whatsapp || '').replace(/\D/g, '').slice(-11),
    convidados: Number.isInteger(Number(b.convidados)) && Number(b.convidados) > 0 ? Number(b.convidados) : null,
    obs: String(b.obs || '').slice(0, 200),
    status: 'bloqueio',
    criadaEm: new Date(agora).toISOString(),
  });
  return json({ ok: true, id });
}

async function cancelar(b) {
  if (!RE_ID.test(b.id || '')) return json({ erro: 'Reserva inválida.' }, 400);
  const loja = lojaReservas();
  const r = await loja.get(b.id, { type: 'json' });
  if (!r) return json({ erro: 'Reserva não encontrada.' }, 404);
  if (r.status === 'bloqueio') { await loja.delete(r.id); return json({ ok: true }); }
  r.status = 'cancelada';
  r.canceladaEm = new Date().toISOString();
  await loja.setJSON(r.id, r);
  return json({ ok: true });
}

export default async (req) => {
  const senha = process.env.ADMIN_PASSWORD;
  if (!senha) return json({ erro: 'Configure ADMIN_PASSWORD nas variáveis de ambiente do Netlify.' }, 503);
  if (!senhaOk(req.headers.get('authorization'), senha)) {
    await espera(800); // atrasa tentativas de adivinhar a senha
    return json({ erro: 'Senha incorreta.' }, 401);
  }
  try {
    if (req.method === 'GET') return json(await painel(new URL(req.url).searchParams.get('mes')));
    if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
    let b;
    try { b = await req.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
    switch (b?.acao) {
      case 'config': {
        const c = validarConfig(b.config);
        if (typeof c === 'string') return json({ erro: c }, 400);
        await lojaAgenda().setJSON('config', c);
        return json({ ok: true });
      }
      case 'dia': return await salvarDia(b);
      case 'bloquear': return await bloquear(b);
      case 'cancelar': return await cancelar(b);
      default: return json({ erro: 'Ação desconhecida.' }, 400);
    }
  } catch (e) {
    console.error('admin:', e);
    return json({ erro: 'Erro no servidor.' }, 500);
  }
};
