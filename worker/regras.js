/* Aconchego · regras da agenda e dos preços (banco D1).
   Aluguel sempre por diária. Preço de cada dia:
   - preço especial da data (definido pela dona), senão
   - feriado: precoFeriado (R$ 400), senão diária: precoDiaria (R$ 500)
   Pacote de fim de semana: sexta+sábado ou sábado+domingo seguidos = precoPacote (R$ 850),
   só quando nenhum dos dois é feriado nem tem preço especial. */

export const MIN_SEGURA = 30;
export const RE_DATA = /^\d{4}-\d{2}-\d{2}$/;
export const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
export const RE_ID = /^\d{4}-\d{2}-\d{2}_[a-f0-9]{12}$/;

export const CONFIG_PADRAO = {
  precoDiaria: 500,
  precoFeriado: 400,
  precoPacote: 850,
  semana: [true, true, true, true, true, true, true], // domingo..sábado
  antecedenciaDias: 1,
  mesesAFrente: 12,
  maxConvidados: 100,
  maxDias: 3,
};

export const json = (corpo, status = 200, extra = {}) => new Response(JSON.stringify(corpo), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

/* ── Datas (texto AAAA-MM-DD; Brasília é UTC-3 o ano todo) ── */
const utc = (s) => { const [a, m, d] = s.split('-').map(Number); return Date.UTC(a, m - 1, d); };
export const hojeSP = (agora = Date.now()) => new Date(agora - 3 * 3600e3).toISOString().slice(0, 10);
export const isoSP = (ms) => new Date(ms - 3 * 3600e3).toISOString().replace('Z', '-03:00');
export const dataValida = (s) => RE_DATA.test(s || '') && new Date(utc(s)).toISOString().slice(0, 10) === s;
export const somaDias = (s, n) => new Date(utc(s) + n * 864e5).toISOString().slice(0, 10);
export const somaMeses = (mes, n) => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7); };
export const diaSemana = (s) => new Date(utc(s)).getUTCDay();
export const fimDoMes = (mes) => { const [a, m] = mes.split('-').map(Number); return `${mes}-${String(new Date(Date.UTC(a, m, 0)).getUTCDate()).padStart(2, '0')}`; };
export const intervalo = (de, ate) => { const r = []; for (let d = de; d <= ate; d = somaDias(d, 1)) r.push(d); return r; };
export const dataBR = (s) => s.split('-').reverse().join('/');
export const SEMANA = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const reais = (v) => `R$ ${Number(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
export const novoId = (data) => `${data}_${[...crypto.getRandomValues(new Uint8Array(6))].map((b) => b.toString(16).padStart(2, '0')).join('')}`;

/* ── Feriados automáticos: nacionais + Carnaval e Corpus Christi (a dona marca/desmarca outros no admin) ── */
const cacheFeriados = {};
function pascoa(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}
export function feriadosDoAno(ano) {
  if (cacheFeriados[ano]) return cacheFeriados[ano];
  const p = pascoa(ano);
  const lista = {
    [`${ano}-01-01`]: 'Confraternização Universal',
    [somaDias(p, -48)]: 'Carnaval',
    [somaDias(p, -47)]: 'Carnaval',
    [somaDias(p, -2)]: 'Sexta-feira Santa',
    [`${ano}-04-21`]: 'Tiradentes',
    [`${ano}-05-01`]: 'Dia do Trabalho',
    [somaDias(p, 60)]: 'Corpus Christi',
    [`${ano}-09-07`]: 'Independência',
    [`${ano}-10-12`]: 'Nossa Senhora Aparecida',
    [`${ano}-11-02`]: 'Finados',
    [`${ano}-11-15`]: 'Proclamação da República',
    [`${ano}-11-20`]: 'Consciência Negra',
    [`${ano}-12-25`]: 'Natal',
  };
  return (cacheFeriados[ano] = lista);
}
export const feriadoAuto = (data) => feriadosDoAno(Number(data.slice(0, 4)))[data] || null;

/* ── Leitura do banco ── */
export async function lerConfig(db) {
  const row = await db.prepare("SELECT valor FROM config WHERE chave = 'geral'").first();
  return { ...CONFIG_PADRAO, ...(row ? JSON.parse(row.valor) : {}) };
}
export async function lerAjustes(db, de, ate) {
  const { results } = await db.prepare('SELECT * FROM dias WHERE data BETWEEN ? AND ?').bind(de, ate).all();
  return Object.fromEntries(results.map((r) => [r.data, r]));
}
/* Ocupação ativa: definitiva (paga/bloqueio) ou pendente ainda dentro dos 30 min */
export async function lerOcupacao(db, de, ate, agora) {
  const { results } = await db.prepare(`SELECT o.data, o.expira_em, r.id, r.status, r.nome, r.whatsapp, r.convidados, r.valor, r.inicio, r.fim
    FROM ocupacao o JOIN reservas r ON r.id = o.reserva_id
    WHERE o.data BETWEEN ? AND ? AND (o.expira_em IS NULL OR o.expira_em > ?)`).bind(de, ate, agora).all();
  return Object.fromEntries(results.map((r) => [r.data, r]));
}

/* Estado de um dia. status: livre | pendente | reservado | fechado */
export function montarDia(data, { config, ajustes, ocupacao, hoje, admin = false }) {
  const aj = ajustes[data] || {};
  const nomeFeriado = feriadoAuto(data);
  const feriado = aj.feriado === 1 ? true : aj.feriado === 0 ? false : !!nomeFeriado;
  const especial = Number.isFinite(aj.preco);
  const preco = especial ? aj.preco : feriado ? config.precoFeriado : config.precoDiaria;
  let motivo = null;
  if (data < hoje) motivo = 'passado';
  else if (data < somaDias(hoje, config.antecedenciaDias)) motivo = 'antecedencia';
  else if (data.slice(0, 7) > somaMeses(hoje.slice(0, 7), config.mesesAFrente)) motivo = 'janela';
  else if (aj.aberto === 0 || (aj.aberto !== 1 && !config.semana[diaSemana(data)])) motivo = 'fechado';
  const oc = ocupacao[data];
  let status = 'livre';
  if (oc) status = oc.expira_em ? 'pendente' : 'reservado';
  else if (motivo || !(preco > 0)) status = 'fechado';
  if (motivo === 'passado' && !admin) status = 'fechado';
  const dia = { data, status, preco, feriado, especial };
  if (admin) {
    Object.assign(dia, { motivo, nomeFeriado, ajuste: ajustes[data] || null });
    if (oc) dia.reserva = { id: oc.id, status: oc.status, nome: oc.nome, whatsapp: oc.whatsapp, convidados: oc.convidados, valor: oc.valor, inicio: oc.inicio, fim: oc.fim };
  }
  return dia;
}

/* Preço de dias seguidos (mesma regra no scripts/agenda.js, só para mostrar; o valor que vale é este) */
export function calcularPreco(dias, config) {
  let total = 0;
  const itens = [];
  const pacoteOk = (a, b) => config.precoPacote > 0 && !a.feriado && !b.feriado && !a.especial && !b.especial
    && ((diaSemana(a.data) === 5 && diaSemana(b.data) === 6) || (diaSemana(a.data) === 6 && diaSemana(b.data) === 0));
  for (let i = 0; i < dias.length; i++) {
    const a = dias[i], b = dias[i + 1];
    if (b && pacoteOk(a, b)) {
      total += config.precoPacote;
      itens.push(`Fim de semana ${dataBR(a.data).slice(0, 5)} e ${dataBR(b.data).slice(0, 5)}: ${reais(config.precoPacote)}`);
      i++;
    } else {
      total += a.preco;
      itens.push(`${dataBR(a.data).slice(0, 5)}${a.feriado ? ' (feriado)' : ''}: ${reais(a.preco)}`);
    }
  }
  return { total: Math.round(total * 100) / 100, detalhe: itens.join(' · ') };
}

/* Situação mostrada: pendente vencida aparece como "expirada" */
export const situacao = (r, agora = Date.now()) => (['pendente', 'pedido'].includes(r.status) && r.expira_em <= agora ? 'expirada' : r.status);
