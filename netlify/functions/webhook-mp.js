/* POST /.netlify/functions/webhook-mp?source_news=webhooks
   1. valida a assinatura (x-signature + MP_WEBHOOK_SECRET)
   2. consulta o pagamento na API do Mercado Pago (o corpo da notificação não é confiável)
   3. se aprovado, marca a reserva como paga e avisa a dona uma única vez */
import { Payment } from 'mercadopago';
import { RE_ID, lerConfig, listarReservas, lojaReservas, lojaAlertas, ocupa, conflita } from '../lib/comum.js';
import { clienteMP, assinaturaValida } from '../lib/mp.js';
import { enviarEmail, enviarWhatsApp, textoAlerta } from '../lib/alertas.js';

const ok = (t = 'ok', status = 200) => new Response(t, { status });

/* Trava por reserva + situação: notificações repetidas não geram alerta duplicado */
async function avisar(r) {
  const travas = lojaAlertas();
  const chave = `${r.id}_${r.status}`;
  if (await travas.get(chave)) return;
  const res = await travas.setJSON(chave, { em: new Date().toISOString() }, { onlyIfNew: true });
  if (res && res.modified === false) return;
  const [email, whats] = await Promise.all([enviarEmail(r), enviarWhatsApp(textoAlerta(r))]);
  console.log('alertas', r.id, { email, whats });
  // Se os dois canais configurados falharam, solta a trava e pede para o MP reenviar mais tarde
  if (email !== true && whats !== true && (email === false || whats === false)) {
    await travas.delete(chave);
    throw new Error('Nenhum alerta foi enviado');
  }
}

export default async (req) => {
  if (req.method !== 'POST') return ok();
  const url = new URL(req.url);
  let corpo = {};
  try { corpo = JSON.parse((await req.text()) || '{}'); } catch { /* corpo vazio */ }
  const tipo = corpo.type || url.searchParams.get('type') || url.searchParams.get('topic');
  const pagamentoId = url.searchParams.get('data.id') || corpo?.data?.id;
  if (tipo !== 'payment' || !pagamentoId) return ok('ignorado');
  if (!assinaturaValida(req.headers, pagamentoId)) {
    console.warn('webhook: assinatura inválida', pagamentoId);
    return ok('assinatura inválida', 401);
  }

  let pg;
  try {
    pg = await new Payment(clienteMP()).get({ id: pagamentoId });
  } catch (e) {
    if (e?.status === 404 || /not.?found/i.test(e?.message || '')) return ok('pagamento não encontrado'); // ex.: simulação do painel do MP
    console.error('webhook: erro ao consultar pagamento', e?.message || e);
    return ok('erro', 500); // o MP tenta de novo
  }

  const reservaId = String(pg.external_reference || '');
  if (!RE_ID.test(reservaId)) return ok('sem reserva');
  const loja = lojaReservas();
  const r = await loja.get(reservaId, { type: 'json' });
  if (!r) { console.warn('webhook: reserva não encontrada', reservaId); return ok('reserva não encontrada'); }

  try {
    if (pg.status === 'approved') {
      if (r.status !== 'paga' && r.status !== 'conflito') {
        const agora = Date.now();
        const config = await lerConfig();
        const outras = (await listarReservas(`${r.data}_`)).filter((o) =>
          o.id !== r.id && ocupa(o, agora) && conflita(o.periodo, r.periodo, config.periodos));
        const valorOk = Number(pg.transaction_amount) + 0.009 >= Number(r.valor);
        // Pagou depois que a reserva expirou e outra pessoa já pegou a data, ou pagou valor menor: dona decide/devolve
        r.status = outras.length || !valorOk || r.status === 'cancelada' ? 'conflito' : 'paga';
        if (!valorOk) r.obs = 'Valor pago menor que o da reserva';
        r.pagoEm = new Date(agora).toISOString();
        r.pagamentoId = String(pg.id);
        r.metodo = pg.payment_type_id;
        r.valorPago = pg.transaction_amount;
        await loja.setJSON(r.id, r);
      }
      await avisar(r);
    } else if (['refunded', 'charged_back', 'cancelled'].includes(pg.status)
      && r.status === 'paga' && r.pagamentoId === String(pg.id)) {
      r.status = 'estornada';
      r.estornadaEm = new Date().toISOString();
      await loja.setJSON(r.id, r); // a data volta a ficar livre
    }
    return ok();
  } catch (e) {
    console.error('webhook:', e?.message || e);
    return ok('erro', 500);
  }
};
