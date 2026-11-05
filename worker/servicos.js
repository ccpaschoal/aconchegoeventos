/* Aconchego · serviços externos: Mercado Pago (API REST), Resend (e-mail) e CallMeBot (WhatsApp) */
import { dataBR, diaSemana, reais, SEMANA } from './regras.js';

/* ── Mercado Pago ── */
export const modoMP = (env) => ((env.MP_MODO || '').toLowerCase() === 'teste' ? 'teste' : 'producao');
const tokenMP = (env) => (modoMP(env) === 'teste' ? env.MP_ACCESS_TOKEN_TESTE : env.MP_ACCESS_TOKEN);

async function mp(env, caminho, { metodo = 'GET', corpo, idempotencia } = {}) {
  const token = tokenMP(env);
  if (!token) throw Object.assign(new Error(`Access Token do Mercado Pago (${modoMP(env)}) não configurado`), { status: 0 });
  const r = await fetch(`https://api.mercadopago.com${caminho}`, {
    method: metodo,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(idempotencia ? { 'X-Idempotency-Key': idempotencia } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw Object.assign(new Error(j.message || `Mercado Pago ${r.status}`), { status: r.status, detalhe: j });
  return j;
}
export const criarPreferencia = (env, corpo, idempotencia) => mp(env, '/checkout/preferences', { metodo: 'POST', corpo, idempotencia });
export const buscarPagamento = (env, id) => mp(env, `/v1/payments/${encodeURIComponent(id)}`);

/* x-signature "ts=...,v1=..." = HMAC-SHA256(MP_WEBHOOK_SECRET, "id:<data.id>;request-id:<x-request-id>;ts:<ts>;") */
export async function assinaturaValida(env, headers, dataId) {
  const segredo = env.MP_WEBHOOK_SECRET;
  if (!segredo) return false;
  const partes = {};
  for (const pedaco of (headers.get('x-signature') || '').split(',')) {
    const [k, v] = pedaco.split('=').map((s) => (s || '').trim());
    if (k && v) partes[k] = v;
  }
  if (!partes.ts || !partes.v1) return false;
  let id = String(dataId || '');
  if (/^[a-z0-9]+$/i.test(id)) id = id.toLowerCase();
  const reqId = headers.get('x-request-id');
  const manifesto = `${id ? `id:${id};` : ''}${reqId ? `request-id:${reqId};` : ''}ts:${partes.ts};`;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(segredo), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(manifesto));
  const esperado = [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return iguais(esperado, partes.v1);
}
/* comparação em tempo constante */
export function iguais(a, b) {
  const x = new TextEncoder().encode(a), y = new TextEncoder().encode(b);
  let dif = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) dif |= (x[i] || 0) ^ (y[i] || 0);
  return dif === 0;
}

/* ── Alertas para a dona ── */
const fone = (n = '') => (n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}` : n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const METODO = { bank_transfer: 'Pix', credit_card: 'cartão de crédito', debit_card: 'cartão de débito', account_money: 'saldo Mercado Pago' };
export const quando = (r) => (r.inicio === r.fim
  ? `${dataBR(r.inicio)} (${SEMANA[diaSemana(r.inicio)]})`
  : `${dataBR(r.inicio)} (${SEMANA[diaSemana(r.inicio)]}) a ${dataBR(r.fim)} (${SEMANA[diaSemana(r.fim)]})`);

function linhas(r) {
  return [
    ['Data', quando(r)],
    ['Valor', `${reais(r.valor_pago ?? r.valor)}${r.metodo ? ` · ${METODO[r.metodo] || r.metodo}` : ''}`],
    ['Cálculo', r.detalhe || '-'],
    ['Cliente', r.nome],
    ['WhatsApp', `${fone(r.whatsapp)} · wa.me/55${r.whatsapp}`],
    ['Convidados', String(r.convidados ?? '-')],
    ['Pagamento MP', r.pagamento_id || '-'],
    ['Código', r.id],
  ];
}
export const titulo = (r) => ({
  conflito: '⚠️ PAGAMENTO APROVADO, MAS A DATA JÁ ESTAVA OCUPADA (ou o valor não bate). Confira e devolva no Mercado Pago.',
  pedido: '📩 NOVO PEDIDO DE RESERVA · o cliente vai chamar no WhatsApp. Confirme ou cancele no painel.',
}[r.status] || '✅ NOVA RESERVA PAGA · Aconchego');
export const textoAlerta = (r) => [titulo(r), '', ...linhas(r).map(([k, v]) => `${k}: ${v}`)].join('\n');

export async function enviarEmail(env, r) {
  if (!env.RESEND_API_KEY || !env.EMAIL_DONA) return null;
  const html = `<div style="font-family:Arial,sans-serif;color:#0C1A24">
    <h2 style="color:#002E45;text-transform:uppercase">${esc(titulo(r))}</h2>
    <table cellpadding="6" style="border-collapse:collapse">${linhas(r).map(([k, v]) =>
      `<tr><td style="font-weight:bold;color:#002E45">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <p><a href="https://wa.me/55${esc(r.whatsapp)}" style="color:#166EC8">Chamar o cliente no WhatsApp</a></p></div>`;
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: env.EMAIL_REMETENTE || 'Reservas Aconchego <onboarding@resend.dev>',
        to: env.EMAIL_DONA.split(',').map((s) => s.trim()).filter(Boolean),
        subject: r.status === 'conflito' ? `⚠️ Conflito de reserva ${dataBR(r.inicio)}`
          : r.status === 'pedido' ? `Pedido de reserva: ${quando(r)}` : `Reserva paga: ${quando(r)}`,
        html,
        text: textoAlerta(r),
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) console.error('Resend:', resp.status, (await resp.text()).slice(0, 300));
    return resp.ok;
  } catch (e) {
    console.error('Resend:', e?.message);
    return false;
  }
}

/* Notificação no celular pelo app ntfy (grátis, sem conta). O nome do tópico funciona como senha: fica em segredo. */
export async function enviarNtfy(env, r) {
  if (!env.NTFY_TOPICO) return null;
  try {
    const resp = await fetch('https://ntfy.sh/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        topic: env.NTFY_TOPICO,
        title: r.status === 'pedido' ? `Pedido de reserva: ${quando(r)}` : r.status === 'conflito' ? `Conflito de reserva ${dataBR(r.inicio)}` : `Reserva paga: ${quando(r)}`,
        message: textoAlerta(r),
        tags: [r.status === 'conflito' ? 'warning' : r.status === 'pedido' ? 'calendar' : 'moneybag'],
        priority: r.status === 'conflito' ? 5 : 4,
        click: `${(env.SITE_URL || 'https://aconchegoeventos.pages.dev').replace(/\/$/, '')}/admin.html`,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!resp.ok) console.error('ntfy:', resp.status, (await resp.text()).slice(0, 200));
    return resp.ok;
  } catch (e) {
    console.error('ntfy:', e?.message);
    return false;
  }
}

export async function enviarWhatsApp(env, texto) {
  if (!env.CALLMEBOT_PHONE || !env.CALLMEBOT_APIKEY) return null;
  try {
    const r = await fetch(`https://api.callmebot.com/whatsapp.php?${new URLSearchParams({ phone: env.CALLMEBOT_PHONE, text: texto, apikey: env.CALLMEBOT_APIKEY })}`,
      { signal: AbortSignal.timeout(10000) });
    const corpo = await r.text();
    const ok = r.ok && !/invalid|error|not allowed/i.test(corpo);
    if (!ok) console.error('CallMeBot:', r.status, corpo.slice(0, 200));
    return ok;
  } catch (e) {
    console.error('CallMeBot:', e?.message);
    return false;
  }
}
