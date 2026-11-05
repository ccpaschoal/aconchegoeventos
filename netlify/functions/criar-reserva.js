/* POST /api/criar-reserva  { data, periodo, nome, whatsapp, convidados }
   Valida, confere a data de novo, segura como "pendente" por 30 min e abre o Checkout Pro.
   O preço vem sempre da agenda no servidor, nunca do navegador. */
import crypto from 'node:crypto';
import { Preference } from 'mercadopago';
import {
  MINUTOS_SEGURA, json, hojeSP, dataValida, dataBR, isoSP, lerConfig, lerExcecoes,
  listarReservas, lojaReservas, montarDia, ocupa, conflita,
} from '../lib/comum.js';
import { clienteMP, modoMP } from '../lib/mp.js';

const OCUPADO = 'Esse período acabou de ser reservado por outra pessoa. Escolha outra data ou período.';

export default async (req) => {
  if (req.method !== 'POST') return json({ erro: 'Método não permitido.' }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ erro: 'Dados inválidos.' }, 400); }
  if (b?.site) return json({ erro: 'Dados inválidos.' }, 400); // campo-isca contra robôs

  const data = String(b.data || '');
  const periodo = String(b.periodo || '');
  const nome = String(b.nome || '').replace(/\s+/g, ' ').trim();
  let whatsapp = String(b.whatsapp || '').replace(/\D/g, '');
  if (whatsapp.length >= 12 && whatsapp.startsWith('55')) whatsapp = whatsapp.slice(2);
  const convidados = Number(b.convidados);

  if (!dataValida(data)) return json({ erro: 'Escolha uma data válida.' }, 400);
  if (nome.length < 3 || nome.length > 80) return json({ erro: 'Informe seu nome.' }, 400);
  if (!/^[1-9]{2}9?\d{8}$/.test(whatsapp)) return json({ erro: 'Informe o WhatsApp com DDD.' }, 400);

  try {
    const config = await lerConfig();
    if (!Number.isInteger(convidados) || convidados < 1 || convidados > config.maxConvidados) {
      return json({ erro: `Informe de 1 a ${config.maxConvidados} convidados.` }, 400);
    }
    const agora = Date.now();
    const hoje = hojeSP(agora);
    const [excecoes, todasDoDia] = await Promise.all([lerExcecoes(data.slice(0, 7)), listarReservas(`${data}_`)]);
    // A mesma pessoa tentando de novo (ex.: voltou do erro do cartão) não fica presa na própria reserva pendente
    const minhas = todasDoDia.filter((r) => r.status === 'pendente' && ocupa(r, agora) && r.whatsapp === whatsapp);
    await Promise.all(minhas.map((r) => lojaReservas().setJSON(r.id, { ...r, status: 'substituida' })));
    const doDia = todasDoDia.filter((r) => !minhas.includes(r));
    const dia = montarDia(data, { config, excecoes, reservas: doDia, hoje, agora });
    const p = dia.periodos.find((x) => x.id === periodo);
    if (!p) return json({ erro: 'Período inválido.' }, 400);
    if (p.status !== 'livre') return json({ erro: OCUPADO }, 409);

    const id = `${data}_${crypto.randomBytes(6).toString('hex')}`;
    const reserva = {
      id, data, periodo, periodoNome: p.nome, horario: p.horario, valor: p.preco,
      nome, whatsapp, convidados, status: 'pendente', ambiente: modoMP(),
      criadaEm: new Date(agora).toISOString(),
      expiraEm: new Date(agora + MINUTOS_SEGURA * 60e3).toISOString(),
    };
    const loja = lojaReservas();
    await loja.setJSON(id, reserva);

    // Confere de novo depois de gravar: se duas pessoas clicarem juntas, a mais antiga fica com a data
    const outras = (await listarReservas(`${data}_`)).filter((r) =>
      r.id !== id && ocupa(r, agora) && conflita(r.periodo, periodo, config.periodos));
    const perdeu = outras.some((r) => r.status !== 'pendente' || r.criadaEm < reserva.criadaEm
      || (r.criadaEm === reserva.criadaEm && r.id < id));
    if (perdeu) { await loja.delete(id); return json({ erro: OCUPADO }, 409); }

    const base = (process.env.SITE_URL || process.env.URL || new URL(req.url).origin).replace(/\/$/, '');
    try {
      const pref = await new Preference(clienteMP()).create({
        body: {
          items: [{
            id: periodo,
            title: `Reserva Aconchego · ${p.nome} · ${dataBR(data)}`,
            description: `${p.nome} (${p.horario}) em ${dataBR(data)} · ${convidados} convidados`,
            quantity: 1,
            unit_price: Number(p.preco),
            currency_id: 'BRL',
          }],
          payer: { name: nome },
          external_reference: id,
          notification_url: `${base}/.netlify/functions/webhook-mp?source_news=webhooks`,
          back_urls: { success: `${base}/sucesso.html`, pending: `${base}/pendente.html`, failure: `${base}/erro.html` },
          auto_return: 'approved',
          // O link e o Pix vencem junto com a reserva pendente; boleto fica de fora porque demora dias
          expires: true,
          expiration_date_from: isoSP(agora - 60e3),
          expiration_date_to: isoSP(Date.parse(reserva.expiraEm)),
          date_of_expiration: isoSP(Date.parse(reserva.expiraEm)),
          payment_methods: { excluded_payment_types: [{ id: 'ticket' }, { id: 'atm' }], installments: 12 },
          statement_descriptor: 'ACONCHEGO',
          metadata: { reserva_id: id },
        },
        requestOptions: { idempotencyKey: id },
      });
      reserva.preferenciaId = pref.id;
      await loja.setJSON(id, reserva);
      return json({ id, init_point: pref.init_point, expiraEm: reserva.expiraEm });
    } catch (e) {
      console.error('Mercado Pago:', e?.message || e, e?.cause || '');
      await loja.delete(id);
      return json({ erro: 'Não foi possível abrir o pagamento agora. Tente de novo em instantes.' }, 502);
    }
  } catch (e) {
    console.error('criar-reserva:', e);
    return json({ erro: 'Erro ao criar a reserva. Tente de novo.' }, 500);
  }
};
