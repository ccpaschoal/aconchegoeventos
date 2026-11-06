// Testes de integração da API: o worker roda de verdade contra um SQLite em memória (mesmo SQL do D1),
// com o Mercado Pago simulado. Rodar com: npm test
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from '../worker/index.js';
import { hojeSP, somaDias, diaSemana } from '../worker/regras.js';

/* ── D1 falso sobre node:sqlite (prepare/bind/first/all/run/batch) ── */
class Comando {
  constructor(sqlite, sql, params = []) { Object.assign(this, { sqlite, sql, params }); }
  bind(...params) { return new Comando(this.sqlite, this.sql, params); }
  async first() { return this.sqlite.prepare(this.sql).get(...this.params) ?? null; }
  async all() { return { results: this.sqlite.prepare(this.sql).all(...this.params) }; }
  async run() {
    const r = this.sqlite.prepare(this.sql).run(...this.params);
    return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
}
function d1() {
  const sqlite = new DatabaseSync(':memory:');
  for (const f of readdirSync(new URL('../migrations/', import.meta.url)).sort()) {
    sqlite.exec(readFileSync(new URL(`../migrations/${f}`, import.meta.url), 'utf8'));
  }
  return {
    sqlite,
    prepare: (sql) => new Comando(sqlite, sql),
    async batch(comandos) { // tudo ou nada, como no D1
      sqlite.exec('BEGIN');
      try {
        const r = [];
        for (const c of comandos) r.push(await c.run());
        sqlite.exec('COMMIT');
        return r;
      } catch (e) { sqlite.exec('ROLLBACK'); throw e; }
    },
  };
}

/* ── Mercado Pago simulado ── */
const pagamentos = new Map();
globalThis.fetch = async (url) => {
  const u = new URL(url);
  if (u.hostname === 'api.mercadopago.com' && u.pathname === '/checkout/preferences') {
    return Response.json({ init_point: 'https://www.mercadopago.com.br/checkout/v1/redirect?pref_id=teste' });
  }
  const m = u.pathname.match(/^\/v1\/payments\/(.+)$/);
  if (u.hostname === 'api.mercadopago.com' && m) {
    const pg = pagamentos.get(m[1]);
    return pg ? Response.json(pg) : Response.json({ message: 'not found' }, { status: 404 });
  }
  throw new Error(`fetch inesperado: ${url}`);
};

const SEGREDO_WEBHOOK = 'segredo-do-webhook';
const SENHA = 'senha-de-teste';
let env;
let esperas;
beforeEach(() => {
  pagamentos.clear();
  esperas = [];
  env = {
    DB: d1(), ASSETS: { fetch: async () => new Response('arquivo') },
    ADMIN_PASSWORD: SENHA, MP_WEBHOOK_SECRET: SEGREDO_WEBHOOK, MP_ACCESS_TOKEN: 'token', SITE_URL: 'https://teste.local',
  };
});

const chamar = async (metodo, caminho, { corpo, ip = '1.1.1.1', cabecalhos = {} } = {}) => {
  const req = new Request(`https://teste.local${caminho}`, {
    method: metodo,
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip, ...cabecalhos },
    body: corpo === undefined ? undefined : typeof corpo === 'string' ? corpo : JSON.stringify(corpo),
  });
  const resp = await worker.fetch(req, env, { waitUntil: (p) => esperas.push(p) });
  await Promise.all(esperas);
  return { status: resp.status, j: await resp.json().catch(() => ({})) };
};

// Um dia útil comum (terça a quinta), sem feriado, a umas semanas daqui
function diaComum(semanas = 3) {
  let d = somaDias(hojeSP(), semanas * 7);
  while (![2, 3, 4].includes(diaSemana(d))) d = somaDias(d, 1);
  return d;
}
const reservar = (inicio, extra = {}) => chamar('POST', '/api/criar-reserva', {
  corpo: { inicio, dias: 1, nome: 'Maria Teste', whatsapp: '(62) 9 9999-0000', ...extra.corpo }, ip: extra.ip,
});

async function avisoDoMP(pagamentoId, status, valor, referencia) {
  pagamentos.set(String(pagamentoId), { id: pagamentoId, status, transaction_amount: valor, external_reference: referencia, payment_type_id: 'bank_transfer' });
  const ts = String(Date.now());
  const reqId = `req-${pagamentoId}-${status}`;
  const chave = await crypto.subtle.importKey('raw', new TextEncoder().encode(SEGREDO_WEBHOOK), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(`id:${pagamentoId};request-id:${reqId};ts:${ts};`));
  const v1 = [...new Uint8Array(assinatura)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return chamar('POST', `/api/webhook-mp?data.id=${pagamentoId}&type=payment`, {
    corpo: { type: 'payment', data: { id: String(pagamentoId) } },
    cabecalhos: { 'x-signature': `ts=${ts},v1=${v1}`, 'x-request-id': reqId },
  });
}
const reserva = (id) => env.DB.sqlite.prepare('SELECT * FROM reservas WHERE id = ?').get(id);
const estadoDoDia = async (data) => (await chamar('GET', `/api/disponibilidade?mes=${data.slice(0, 7)}`)).j.dias.find((d) => d.data === data).status;

/* ── Disponibilidade ── */
test('disponibilidade: mostra o mês sem dados de clientes', async () => {
  const dia = diaComum();
  await reservar(dia);
  const { status, j } = await chamar('GET', `/api/disponibilidade?mes=${dia.slice(0, 7)}`);
  assert.equal(status, 200);
  assert.ok(j.dias.length >= 28);
  const texto = JSON.stringify(j);
  assert.ok(!texto.includes('Maria') && !texto.includes('99999'), 'não pode vazar nome nem WhatsApp');
});

/* ── Criar reserva ── */
test('reserva válida guarda a data e devolve o link do Mercado Pago', async () => {
  const dia = diaComum();
  const { status, j } = await reservar(dia);
  assert.equal(status, 200);
  assert.match(j.init_point, /^https:\/\/www\.mercadopago\.com\.br\//);
  assert.equal(await estadoDoDia(dia), 'reservado');
  assert.equal(reserva(j.id).whatsapp, '62999990000', 'WhatsApp guardado só com números');
});

test('a mesma data não pode ser reservada por outra pessoa', async () => {
  const dia = diaComum();
  assert.equal((await reservar(dia)).status, 200);
  const { status, j } = await reservar(dia, { ip: '2.2.2.2', corpo: { whatsapp: '62988887777' } });
  assert.equal(status, 409);
  assert.match(j.erro, /reservada/);
});

test('duas pessoas clicando ao mesmo tempo: só uma consegue', async () => {
  const dia = diaComum();
  const r = await Promise.all([
    reservar(dia, { ip: '3.3.3.3', corpo: { whatsapp: '62911112222' } }),
    reservar(dia, { ip: '4.4.4.4', corpo: { whatsapp: '62933334444' } }),
  ]);
  assert.deepEqual(r.map((x) => x.status).sort(), [200, 409]);
});

test('dados inválidos são recusados', async () => {
  const dia = diaComum();
  const casos = [
    { inicio: dia, dias: 1, nome: 'Jo', whatsapp: '62999990000' },                 // nome curto
    { inicio: dia, dias: 1, nome: 'Maria', whatsapp: '123' },                      // WhatsApp sem DDD
    { inicio: dia, dias: 9, nome: 'Maria', whatsapp: '62999990000' },              // dias acima do máximo
    { inicio: '2026-02-30', dias: 1, nome: 'Maria', whatsapp: '62999990000' },     // data que não existe
    { inicio: hojeSP(), dias: 1, nome: 'Maria', whatsapp: '62999990000' },         // dentro da antecedência
    { inicio: dia, dias: 1, nome: 'Maria', whatsapp: '62999990000', site: 'robo' }, // campo-isca
  ];
  for (const corpo of casos) {
    const { status } = await chamar('POST', '/api/criar-reserva', { corpo });
    assert.ok([400, 409].includes(status), `${JSON.stringify(corpo)} deveria ser recusado (veio ${status})`);
  }
  assert.equal((await chamar('POST', '/api/criar-reserva', { corpo: '{quebrado' })).status, 400);
});

test('limite de 3 reservas em aberto por pessoa', async () => {
  const ip = '5.5.5.5';
  for (let i = 0; i < 3; i++) {
    const r = await reservar(diaComum(3 + i), { ip, corpo: { whatsapp: `6299999000${i}` } });
    assert.equal(r.status, 200);
  }
  assert.equal((await reservar(diaComum(7), { ip, corpo: { whatsapp: '62999990009' } })).status, 429);
});

test('sem Mercado Pago, vira pedido pelo WhatsApp do salão', async () => {
  delete env.MP_ACCESS_TOKEN;
  const { status, j } = await reservar(diaComum());
  assert.equal(status, 200);
  assert.equal(new URL(j.whatsapp).hostname, 'wa.me');
  assert.equal(reserva(j.id).status, 'pedido');
});

/* ── Webhook do Mercado Pago ── */
test('webhook com assinatura falsa é recusado', async () => {
  const { j } = await reservar(diaComum());
  pagamentos.set('99', { id: 99, status: 'approved', transaction_amount: 9999, external_reference: j.id });
  const r = await chamar('POST', '/api/webhook-mp?data.id=99&type=payment', {
    corpo: { type: 'payment', data: { id: '99' } }, cabecalhos: { 'x-signature': 'ts=1,v1=abc', 'x-request-id': 'x' },
  });
  assert.equal(r.status, 401);
  assert.equal(reserva(j.id).status, 'pendente');
});

test('pagamento aprovado confirma a reserva (e aviso repetido não duplica nada)', async () => {
  const dia = diaComum();
  const { j } = await reservar(dia);
  const valor = reserva(j.id).valor;
  assert.equal((await avisoDoMP(101, 'approved', valor, j.id)).status, 200);
  assert.equal(reserva(j.id).status, 'paga');
  assert.equal(env.DB.sqlite.prepare('SELECT expira_em FROM ocupacao WHERE data = ?').get(dia).expira_em, null, 'dia firmado');
  await avisoDoMP(101, 'approved', valor, j.id);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM avisos WHERE reserva_id = ?').get(j.id).n, 1);
});

test('pagamento menor que o valor vira conflito e libera a data', async () => {
  const dia = diaComum();
  const { j } = await reservar(dia);
  await avisoDoMP(102, 'approved', reserva(j.id).valor - 1, j.id);
  assert.equal(reserva(j.id).status, 'conflito');
  assert.equal(await estadoDoDia(dia), 'disponivel');
});

test('Pix pago depois de vencer, com a data já de outra pessoa, vira conflito', async () => {
  const dia = diaComum();
  const a = (await reservar(dia)).j;
  env.DB.sqlite.prepare('UPDATE ocupacao SET expira_em = 1 WHERE reserva_id = ?').run(a.id); // venceu
  env.DB.sqlite.prepare('UPDATE reservas SET expira_em = 1 WHERE id = ?').run(a.id);
  const b = (await reservar(dia, { ip: '6.6.6.6', corpo: { whatsapp: '62977776666' } })).j;
  assert.ok(b.id, 'outra pessoa consegue a data vencida');
  await avisoDoMP(103, 'approved', reserva(a.id).valor, a.id);
  assert.equal(reserva(a.id).status, 'conflito');
  assert.equal(reserva(b.id).status, 'pendente', 'a reserva da outra pessoa continua');
});

test('cliente tentou de novo mas pagou o link antigo: a reserva vale', async () => {
  const dia = diaComum();
  const antiga = (await reservar(dia)).j;
  const nova = (await reservar(dia)).j; // mesmo WhatsApp e conexão: substitui a antiga
  assert.equal(reserva(antiga.id).status, 'substituida');
  await avisoDoMP(104, 'approved', reserva(antiga.id).valor, antiga.id);
  assert.equal(reserva(antiga.id).status, 'paga');
  assert.equal(reserva(nova.id).status, 'substituida');
  assert.equal(await estadoDoDia(dia), 'reservado');
});

test('estorno libera a data', async () => {
  const dia = diaComum();
  const { j } = await reservar(dia);
  const valor = reserva(j.id).valor;
  await avisoDoMP(105, 'approved', valor, j.id);
  await avisoDoMP(105, 'refunded', valor, j.id);
  assert.equal(reserva(j.id).status, 'estornada');
  assert.equal(await estadoDoDia(dia), 'disponivel');
});

/* ── Painel da dona ── */
const entrar = (senha = SENHA, ip = '7.7.7.7') => chamar('POST', '/api/admin', { corpo: { acao: 'entrar', senha }, ip });
const admin = async (metodo, corpo, ip = '7.7.7.7') => {
  const { j } = await entrar(SENHA, ip);
  return chamar(metodo, '/api/admin', { corpo, ip, cabecalhos: { Authorization: `Bearer ${j.token}` } });
};

test('painel: senha errada é recusada e muitas tentativas bloqueiam', async () => {
  assert.equal((await entrar('errada')).status, 401);
  const ok = await entrar();
  assert.equal(ok.status, 200);
  assert.match(ok.j.token, /^\d+\.[a-f0-9]{64}$/);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM tentativas').get().n, 1, 'senha certa não conta como erro');
  const { j } = await admin('GET');
  assert.ok(Array.isArray(j.reservas));
  const agora = Date.now();
  const ipHash = env.DB.sqlite.prepare('SELECT ip_hash FROM tentativas LIMIT 1').get().ip_hash;
  for (let i = 0; i < 10; i++) env.DB.sqlite.prepare('INSERT INTO tentativas (ip_hash, em) VALUES (?, ?)').run(ipHash, agora);
  assert.equal((await entrar()).status, 429, 'até a senha certa espera depois de 10 erros');
});

test('painel: token falso, vencido ou de outra senha é recusado; senha não vale como token', async () => {
  const chamarCom = (t) => chamar('GET', '/api/admin', { cabecalhos: { Authorization: `Bearer ${t}` } });
  assert.equal((await chamarCom(SENHA)).status, 401);
  assert.equal((await chamarCom(`${Date.now() + 3600e3}.${'0'.repeat(64)}`)).status, 401);
  const { j } = await entrar();
  assert.equal((await chamarCom(j.token)).status, 200);
  env.ADMIN_PASSWORD = 'senha-nova';
  assert.equal((await chamarCom(j.token)).status, 401, 'trocar a senha derruba a sessão');
});

test('painel: tentativas em paralelo também contam no limite', async () => {
  const r = await Promise.all(Array.from({ length: 12 }, () => entrar('errada', '8.8.8.8')));
  assert.ok(r.some((x) => x.status === 429));
});

test('painel: avisa quando falta o segredo do webhook (e o site não cobra sem ele)', async () => {
  delete env.MP_WEBHOOK_SECRET;
  const { j } = await admin('GET');
  assert.ok(j.pendencias.some((p) => p.includes('MP_WEBHOOK_SECRET')));
  assert.equal(j.pagamento, 'whatsapp');
});

test('painel: reserva paga só é cancelada depois de devolver o dinheiro', async () => {
  const dia = diaComum();
  const { j } = await reservar(dia);
  await avisoDoMP(901, 'approved', 99999, j.id);
  assert.equal(reserva(j.id).status, 'paga');
  assert.equal((await admin('POST', { acao: 'cancelar', id: j.id })).status, 409);
  assert.equal((await admin('POST', { acao: 'cancelar', id: j.id, jaDevolvido: true })).status, 200);
  assert.equal(await estadoDoDia(dia), 'disponivel');
});

test('corpo null, lista ou grande demais vira 400/413, nunca 500', async () => {
  assert.equal((await chamar('POST', '/api/criar-reserva', { corpo: 'null' })).status, 400);
  assert.equal((await chamar('POST', '/api/criar-reserva', { corpo: '[]' })).status, 400);
  assert.equal((await chamar('POST', '/api/admin', { corpo: 'null' })).status, 400);
  assert.notEqual((await chamar('POST', '/api/webhook-mp', { corpo: 'null' })).status, 500);
  const grande = await chamar('POST', '/api/criar-reserva', { corpo: { nome: 'x'.repeat(20000) } });
  assert.equal(grande.status, 413);
});

test('reserva nova numa data ocupada não apaga a reserva antiga da mesma pessoa', async () => {
  const dia = diaComum(), outro = diaComum(5);
  const minha = (await reservar(dia)).j;
  await reservar(outro, { ip: '9.9.9.9', corpo: { whatsapp: '62988887777' } });
  // tenta trocar para um período que inclui o dia dela e o dia de outra pessoa
  const r = await chamar('POST', '/api/criar-reserva', { corpo: { inicio: dia, dias: 1, nome: 'Maria Teste', whatsapp: '(62) 9 9999-0000' } });
  assert.equal(r.status, 200, 'refazer o mesmo dia funciona');
  assert.equal(reserva(minha.id).status, 'substituida');
  const nova = r.j.id;
  const falha = await chamar('POST', '/api/criar-reserva', { corpo: { inicio: outro, dias: 1, nome: 'Maria Teste', whatsapp: '(62) 9 9999-0000' } });
  assert.equal(falha.status, 409);
  assert.equal(reserva(nova).status, 'pendente', 'a reserva que ela já tinha continua valendo');
});

test('limite de pedidos abertos também vale por WhatsApp, mesmo trocando de IP', async () => {
  for (let i = 0; i < 3; i++) assert.equal((await reservar(diaComum(3 + i), { ip: `5.5.5.${i}` })).status, 200);
  assert.equal((await reservar(diaComum(8), { ip: '5.5.5.9' })).status, 429);
});

test('status da reserva: só o estado, sem dados do cliente', async () => {
  const { j } = await reservar(diaComum());
  const s = await chamar('GET', `/api/status?id=${j.id}`);
  assert.deepEqual(s.j, { status: 'pendente' });
  assert.equal((await chamar('GET', '/api/status?id=xyz')).status, 400);
});

test('CORS: rotas públicas aceitam o GitHub Pages, o painel não', async () => {
  const origem = { Origin: 'https://ccpaschoal.github.io' };
  const req = (c) => new Request(`https://teste.local${c}`, { headers: { ...origem, 'CF-Connecting-IP': '1.1.1.1' } });
  const pub = await worker.fetch(req('/api/disponibilidade'), env, { waitUntil() {} });
  assert.equal(pub.headers.get('Access-Control-Allow-Origin'), origem.Origin);
  const adm = await worker.fetch(req('/api/admin'), env, { waitUntil() {} });
  assert.equal(adm.headers.get('Access-Control-Allow-Origin'), null);
});

test('painel: preço vazio ou zero não é aceito', async () => {
  const base = { precoDiaria: 500, precoFeriado: 400, precoPacote: 850, semana: Array(7).fill(true), antecedenciaDias: 1, mesesAFrente: 12, maxDias: 3 };
  assert.equal((await admin('POST', { acao: 'config', config: { ...base, precoDiaria: 0 } })).status, 400);
  assert.equal((await admin('POST', { acao: 'config', config: { ...base, precoPacote: '' } })).status, 400);
  assert.equal((await admin('POST', { acao: 'config', config: base })).status, 200);
});

test('painel: bloquear, confirmar pedido e cancelar', async () => {
  const dia = diaComum();
  const bloq = await admin('POST', { acao: 'bloquear', inicio: dia, dias: 2, nome: 'Fulano' });
  assert.equal(bloq.status, 200);
  assert.equal(await estadoDoDia(dia), 'reservado');
  assert.equal((await admin('POST', { acao: 'bloquear', inicio: dia, dias: 1 })).status, 409, 'não bloqueia duas vezes');
  assert.equal((await admin('POST', { acao: 'cancelar', id: bloq.j.id })).status, 200);
  assert.equal(await estadoDoDia(dia), 'disponivel');

  delete env.MP_ACCESS_TOKEN;
  const pedido = (await reservar(dia)).j;
  assert.equal((await admin('POST', { acao: 'confirmar', id: pedido.id })).status, 200);
  assert.equal(reserva(pedido.id).status, 'confirmada');
});

test('rotas desconhecidas e métodos errados', async () => {
  assert.equal((await chamar('GET', '/api/nada')).status, 404);
  assert.equal((await chamar('GET', '/api/criar-reserva')).status, 404);
});
