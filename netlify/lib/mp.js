/* Aconchego · Mercado Pago: credenciais e validação da assinatura do webhook */
import crypto from 'node:crypto';
import { MercadoPagoConfig } from 'mercadopago';

/* MP_MODO=teste usa MP_ACCESS_TOKEN_TESTE; qualquer outro valor usa o de produção */
export const modoMP = () => ((process.env.MP_MODO || '').toLowerCase() === 'teste' ? 'teste' : 'producao');

export function clienteMP() {
  const token = modoMP() === 'teste' ? process.env.MP_ACCESS_TOKEN_TESTE : process.env.MP_ACCESS_TOKEN;
  if (!token) throw new Error(`Access Token do Mercado Pago (${modoMP()}) não configurado`);
  return new MercadoPagoConfig({ accessToken: token, options: { timeout: 8000 } });
}

/* x-signature: "ts=1704908010,v1=hash". O hash é HMAC-SHA256 (MP_WEBHOOK_SECRET) de
   "id:<data.id>;request-id:<x-request-id>;ts:<ts>;" (partes ausentes ficam de fora). */
export function assinaturaValida(headers, dataId, segredo = process.env.MP_WEBHOOK_SECRET) {
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
  let manifesto = '';
  if (id) manifesto += `id:${id};`;
  if (reqId) manifesto += `request-id:${reqId};`;
  manifesto += `ts:${partes.ts};`;
  const esperado = Buffer.from(crypto.createHmac('sha256', segredo).update(manifesto).digest('hex'));
  const recebido = Buffer.from(partes.v1);
  return esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
}
