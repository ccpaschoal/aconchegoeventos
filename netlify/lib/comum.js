/* Aconchego · regras da agenda usadas por todas as functions.
   Armazenamento (Netlify Blobs):
   - loja "agenda":   "config" (períodos, preços padrão, dias da semana abertos...)
                      "excecoes/AAAA-MM" ({ "AAAA-MM-DD": { aberto, periodos: { id: { fechado, preco } } } })
   - loja "reservas": uma chave por reserva, "AAAA-MM-DD_xxxxxxxxxxxx" (a data na frente permite listar por mês)
   - loja "alertas":  trava para não avisar a dona duas vezes */
import { getStore } from '@netlify/blobs';

export const TZ = 'America/Sao_Paulo';
export const MINUTOS_SEGURA = 30;
export const RE_MES = /^\d{4}-(0[1-9]|1[0-2])$/;
export const RE_ID = /^\d{4}-\d{2}-\d{2}_[a-f0-9]{12}$/;
export const RE_PERIODO = /^[a-z0-9-]{1,24}$/;

export const lojaAgenda = () => getStore({ name: 'agenda', consistency: 'strong' });
export const lojaReservas = () => getStore({ name: 'reservas', consistency: 'strong' });
export const lojaAlertas = () => getStore({ name: 'alertas', consistency: 'strong' });

/* Ponto de partida até a dona salvar a configuração no admin.
   Preço 0 = período não aparece para reserva (ela define os valores no admin.html). */
export const CONFIG_PADRAO = {
  periodos: [
    { id: 'dia', nome: 'Dia', horario: '9h às 18h', preco: 0, diaInteiro: false },
    { id: 'noite', nome: 'Noite', horario: '19h às 2h', preco: 0, diaInteiro: false },
    { id: 'diaria', nome: 'Diária', horario: '9h às 2h', preco: 0, diaInteiro: true },
  ],
  semana: [true, true, true, true, true, true, true], // domingo..sábado abertos por padrão
  antecedenciaDias: 1,
  mesesAFrente: 12,
  maxConvidados: 100,
};

export const json = (corpo, status = 200, extra = {}) => new Response(JSON.stringify(corpo), {
  status,
  headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...extra },
});

/* ── Datas (sempre texto AAAA-MM-DD, sem fuso) ── */
const utc = (data) => { const [a, m, d] = data.split('-').map(Number); return Date.UTC(a, m - 1, d); };
export const hojeSP = (agora = Date.now()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(agora);
export const dataValida = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && new Date(utc(s)).toISOString().slice(0, 10) === s;
export const somaDias = (data, n) => new Date(utc(data) + n * 864e5).toISOString().slice(0, 10);
export const somaMeses = (mes, n) => { const [a, m] = mes.split('-').map(Number); return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7); };
export const diaSemana = (data) => new Date(utc(data)).getUTCDay();
export const diasDoMes = (mes) => {
  const [a, m] = mes.split('-').map(Number);
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate();
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`);
};
/* Horário de Brasília no formato que o Mercado Pago pede (o Brasil não tem horário de verão desde 2019) */
export const isoSP = (ms) => new Date(ms - 3 * 3600e3).toISOString().replace('Z', '-03:00');
export const dataBR = (data) => data.split('-').reverse().join('/');
export const SEMANA = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
export const reais = (v) => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/* ── Leitura ── */
export async function lerConfig() {
  const salvo = await lojaAgenda().get('config', { type: 'json' });
  return { ...CONFIG_PADRAO, ...(salvo || {}) };
}
export async function lerExcecoes(mes) {
  return (await lojaAgenda().get(`excecoes/${mes}`, { type: 'json' })) || {};
}
/* prefixo "2026-12" = mês, "2026-12-05_" = um dia; filtro opcional pela chave antes de baixar */
export async function listarReservas(prefixo = '', filtro = () => true) {
  const loja = lojaReservas();
  const { blobs } = await loja.list(prefixo ? { prefix: prefixo } : undefined);
  const chaves = blobs.map((b) => b.key).filter((k) => RE_ID.test(k) && filtro(k));
  const lista = await Promise.all(chaves.map((k) => loja.get(k, { type: 'json' })));
  return lista.filter(Boolean);
}

/* ── Regras ── */
/* pendente que passou de 30 min vira "expirada" e não segura mais a data */
export const situacao = (r, agora = Date.now()) =>
  r.status === 'pendente' && Date.parse(r.expiraEm) <= agora ? 'expirada' : r.status;
export const ocupa = (r, agora) => ['paga', 'bloqueio', 'pendente'].includes(situacao(r, agora));

/* Dois períodos se chocam se forem o mesmo ou se um deles ocupa o dia inteiro (Diária).
   Período apagado da configuração conta como dia inteiro, para nunca liberar uma data já paga. */
export function conflita(a, b, periodos) {
  if (a === b) return true;
  const inteiro = (id) => { const p = periodos.find((x) => x.id === id); return !p || p.diaInteiro; };
  return inteiro(a) || inteiro(b);
}

export const resumoReserva = (r, agora) => ({
  id: r.id, nome: r.nome, whatsapp: r.whatsapp, convidados: r.convidados, valor: r.valor, situacao: situacao(r, agora),
});

/* Junta configuração + exceções + reservas e diz o estado de cada período de um dia.
   Período: livre | pendente (alguém pagando) | reservado | fechado
   Dia:     disponivel (algum livre) | reservado | indisponivel */
export function montarDia(data, { config, excecoes, reservas, hoje, agora, admin = false }) {
  const exc = excecoes[data] || {};
  const minimo = somaDias(hoje, config.antecedenciaDias);
  const mesLimite = somaMeses(hoje.slice(0, 7), config.mesesAFrente);
  let motivo = null;
  if (data < hoje) motivo = 'passado';
  else if (data < minimo) motivo = 'antecedencia';
  else if (data.slice(0, 7) > mesLimite) motivo = 'janela';
  else if (exc.aberto === false || (exc.aberto !== true && !config.semana[diaSemana(data)])) motivo = 'fechado';

  const doDia = reservas.filter((r) => r.data === data && ocupa(r, agora));
  const periodos = config.periodos.map((p) => {
    const ep = exc.periodos?.[p.id] || {};
    const preco = Number.isFinite(ep.preco) ? ep.preco : p.preco;
    const quem = doDia.find((r) => conflita(r.periodo, p.id, config.periodos));
    let status = 'livre';
    if (motivo === 'passado' && !admin) status = 'fechado';
    else if (quem) status = situacao(quem, agora) === 'pendente' ? 'pendente' : 'reservado';
    else if (motivo || ep.fechado || !(preco > 0)) status = 'fechado';
    const item = { id: p.id, nome: p.nome, horario: p.horario, status };
    if (status === 'livre' || admin) item.preco = preco;
    if (admin) {
      item.fechado = !!ep.fechado;
      item.precoExcecao = Number.isFinite(ep.preco) ? ep.preco : null;
      if (quem) item.reserva = resumoReserva(quem, agora);
    }
    return item;
  });

  const st = periodos.map((p) => p.status);
  const status = st.includes('livre') ? 'disponivel'
    : st.includes('reservado') || st.includes('pendente') ? 'reservado' : 'indisponivel';
  const dia = { data, status, periodos };
  if (admin) { dia.motivo = motivo; dia.excecao = excecoes[data] || null; }
  return dia;
}
