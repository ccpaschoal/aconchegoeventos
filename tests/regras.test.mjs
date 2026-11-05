// Testes das regras de preço, feriados, agenda e assinatura do Mercado Pago. Rodar: npm test
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { CONFIG_PADRAO as cfg, calcularPreco, feriadoAuto, montarDia, situacao, dataValida, somaDias } from '../worker/regras.js';
import { assinaturaValida, iguais } from '../worker/servicos.js';

const dia = (data, extra = {}) => {
  const feriado = !!feriadoAuto(data);
  return { data, preco: feriado ? cfg.precoFeriado : cfg.precoDiaria, feriado, especial: false, ...extra };
};
const preco = (datas, mods = {}) => calcularPreco(datas.map((d) => dia(d, mods[d])), cfg).total;

test('preços: diária, pacote de fim de semana e feriado', () => {
  assert.equal(preco(['2026-12-05']), 500);                                   // sábado avulso
  assert.equal(preco(['2026-12-04', '2026-12-05']), 850);                     // sexta + sábado
  assert.equal(preco(['2026-12-05', '2026-12-06']), 850);                     // sábado + domingo
  assert.equal(preco(['2026-12-04', '2026-12-05', '2026-12-06']), 1350);      // sex + sáb + dom
  assert.equal(preco(['2026-12-03', '2026-12-04']), 1000);                    // quinta + sexta: sem pacote
  assert.equal(preco(['2026-12-25']), 400);                                   // Natal
  assert.equal(preco(['2026-12-25', '2026-12-26']), 900);                     // feriado não entra no pacote
  assert.equal(preco(['2026-12-04', '2026-12-05', '2026-12-06'], { '2026-12-06': { feriado: true, preco: 400 } }), 1250);
  assert.equal(preco(['2026-12-04', '2026-12-05'], { '2026-12-05': { especial: true, preco: 700 } }), 1200); // preço especial não entra no pacote
});

test('feriados automáticos (inclusive os que dependem da Páscoa)', () => {
  assert.equal(feriadoAuto('2026-11-20'), 'Consciência Negra');
  assert.equal(feriadoAuto('2027-03-26'), 'Sexta-feira Santa');
  assert.equal(feriadoAuto('2027-02-09'), 'Carnaval');
  assert.equal(feriadoAuto('2026-11-21'), null);
});

test('agenda: passado, antecedência, dia fechado, ocupado e pendência vencida', () => {
  const ctx = (extra = {}) => ({ config: cfg, ajustes: {}, ocupacao: {}, hoje: '2026-11-05', ...extra });
  assert.equal(montarDia('2026-11-04', ctx()).status, 'fechado');
  assert.equal(montarDia('2026-11-05', ctx()).status, 'fechado');
  assert.equal(montarDia('2026-11-06', ctx()).status, 'livre');
  assert.equal(montarDia('2026-11-06', ctx({ ajustes: { '2026-11-06': { aberto: 0 } } })).status, 'fechado');
  assert.equal(montarDia('2026-11-06', ctx({ ocupacao: { '2026-11-06': { expira_em: null, status: 'paga' } } })).status, 'reservado');
  assert.equal(montarDia('2026-11-06', ctx({ ocupacao: { '2026-11-06': { expira_em: 9e15, status: 'pedido' } } })).status, 'pendente');
  assert.equal(situacao({ status: 'pedido', expira_em: 1 }, 2), 'expirada');
  assert.equal(montarDia('2027-12-01', ctx()).status, 'fechado'); // além de 12 meses
});

test('datas inválidas são recusadas', () => {
  assert.equal(dataValida('2026-02-30'), false);
  assert.equal(dataValida('2026-13-01'), false);
  assert.equal(dataValida('2026-12-05'), true);
  assert.equal(somaDias('2026-12-31', 1), '2027-01-01');
});

test('assinatura do webhook do Mercado Pago', async () => {
  const env = { MP_WEBHOOK_SECRET: 'segredo' };
  const ts = '1704908010', rid = 'req-1', id = '123456';
  const v1 = createHmac('sha256', 'segredo').update(`id:${id};request-id:${rid};ts:${ts};`).digest('hex');
  const h = new Headers({ 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': rid });
  assert.equal(await assinaturaValida(env, h, id), true);
  assert.equal(await assinaturaValida(env, h, '999'), false);
  assert.equal(await assinaturaValida({}, h, id), false);
  assert.equal(iguais('abc', 'abc'), true);
  assert.equal(iguais('abc', 'abd'), false);
});
