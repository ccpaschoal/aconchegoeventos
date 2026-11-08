import { test } from 'node:test';
import assert from 'node:assert/strict';
import { enviarWhatsApp, enviarEmail, enviarNtfy, criarPreferencia } from '../worker/servicos.js';

const marcador = 'valor-ficticio-nao-deve-aparecer-no-log';
const reserva = { id: 'teste', inicio: '2027-01-12', fim: '2027-01-12', valor: 500, nome: 'Teste', whatsapp: '62999990000', status: 'pedido' };
const canais = [
  ['CallMeBot', () => enviarWhatsApp({ CALLMEBOT_PHONE: '5562999990000', CALLMEBOT_APIKEY: marcador }, 'teste')],
  ['Resend', () => enviarEmail({ RESEND_API_KEY: marcador, EMAIL_DONA: 'teste@example.invalid' }, reserva)],
  ['ntfy', () => enviarNtfy({ NTFY_TOPICO: marcador }, reserva)],
];

for (const [nome, enviar] of canais) {
  test(`${nome}: erro do serviço não grava corpo nem mensagem que possa conter segredo`, async (t) => {
    const logs = [];
    t.mock.method(console, 'error', (...args) => logs.push(args));
    const buscar = t.mock.method(globalThis, 'fetch', async () => new Response(marcador, { status: 401 }));
    assert.equal(await enviar(), false);
    buscar.mock.mockImplementation(async () => { throw new Error(marcador); });
    assert.equal(await enviar(), false);
    assert.ok(logs.length > 0);
    assert.ok(!JSON.stringify(logs).includes(marcador), 'credencial simulada não deve ser registrada');
  });
}

test('Mercado Pago: falha mantém status, sem carregar mensagem/corpo externo no erro', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ message: marcador, access_token: marcador }, { status: 401 }));
  await assert.rejects(criarPreferencia({ MP_ACCESS_TOKEN: marcador }, {}, 'teste'), (erro) => {
    assert.equal(erro.status, 401);
    assert.ok(!erro.message.includes(marcador), 'erro não pode repetir a resposta do serviço');
    assert.equal(erro.detalhe, undefined);
    return true;
  });
});
