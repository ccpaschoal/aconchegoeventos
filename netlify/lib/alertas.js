/* Aconchego · avisos para a dona: e-mail (Resend) e WhatsApp (CallMeBot) */
import { Resend } from 'resend';
import { dataBR, diaSemana, reais, SEMANA } from './comum.js';

const fone = (n = '') => (n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}` : n);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const METODO = { bank_transfer: 'Pix', credit_card: 'cartão de crédito', debit_card: 'cartão de débito', account_money: 'saldo Mercado Pago' };

function linhas(r) {
  return [
    ['Data', `${dataBR(r.data)} (${SEMANA[diaSemana(r.data)]})`],
    ['Período', `${r.periodoNome}${r.horario ? ` · ${r.horario}` : ''}`],
    ['Valor', `${reais(r.valorPago ?? r.valor)}${r.metodo ? ` · ${METODO[r.metodo] || r.metodo}` : ''}`],
    ['Cliente', r.nome],
    ['WhatsApp', `${fone(r.whatsapp)} · wa.me/55${r.whatsapp}`],
    ['Convidados', String(r.convidados ?? '-')],
    ['Pagamento MP', r.pagamentoId || '-'],
    ['Código', r.id],
  ];
}

const titulo = (r) => (r.status === 'conflito'
  ? '⚠️ PAGAMENTO APROVADO, MAS A DATA JÁ ESTAVA OCUPADA. Devolva o valor no Mercado Pago.'
  : '✅ NOVA RESERVA PAGA · Aconchego');

export const textoAlerta = (r) => [titulo(r), '', ...linhas(r).map(([k, v]) => `${k}: ${v}`)].join('\n');

export async function enviarEmail(r) {
  const chave = process.env.RESEND_API_KEY;
  const para = process.env.EMAIL_DONA;
  if (!chave || !para) return null;
  const html = `<div style="font-family:Arial,sans-serif;color:#0C1A24">
    <h2 style="color:#002E45;text-transform:uppercase">${esc(titulo(r))}</h2>
    <table cellpadding="6" style="border-collapse:collapse">${linhas(r).map(([k, v]) =>
      `<tr><td style="font-weight:bold;color:#002E45">${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table>
    <p><a href="https://wa.me/55${esc(r.whatsapp)}" style="color:#166EC8">Chamar o cliente no WhatsApp</a></p></div>`;
  try {
    const { error } = await new Resend(chave).emails.send({
      from: process.env.EMAIL_REMETENTE || 'Reservas Aconchego <onboarding@resend.dev>',
      to: para.split(',').map((s) => s.trim()).filter(Boolean),
      subject: r.status === 'conflito' ? `⚠️ Conflito de reserva ${dataBR(r.data)}` : `Reserva paga: ${dataBR(r.data)} · ${r.periodoNome}`,
      html,
      text: textoAlerta(r),
    });
    if (error) { console.error('Resend:', error); return false; }
    return true;
  } catch (e) {
    console.error('Resend:', e?.message);
    return false;
  }
}

export async function enviarWhatsApp(texto) {
  const phone = process.env.CALLMEBOT_PHONE;
  const apikey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) return null;
  try {
    const r = await fetch(`https://api.callmebot.com/whatsapp.php?${new URLSearchParams({ phone, text: texto, apikey })}`,
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
