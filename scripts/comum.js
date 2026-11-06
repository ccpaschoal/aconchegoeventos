/* Aconchego · funções usadas por mais de uma página (agenda, painel, telas e retorno do pagamento).
   Datas sempre em texto AAAA-MM-DD para não sofrer com fuso horário. Carregar antes dos outros scripts. */
(() => {
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  // A API mora na Cloudflare; aberto pelo GitHub Pages, o site fala com ela pelo endereço completo
  const API_EXTERNA = 'https://aconchegoeventos.pages.dev/api';
  const api = () => (location.hostname.endsWith('github.io') ? API_EXTERNA : '/api');

  const pad = (n) => String(n).padStart(2, '0');
  const partes = (s) => s.split('-').map(Number);
  const utc = (s) => { const [a, m, d] = partes(s); return new Date(Date.UTC(a, m - 1, d || 1)); };
  const somaDias = (s, n) => new Date(utc(s).getTime() + n * 864e5).toISOString().slice(0, 10);
  const somaMeses = (mes, n) => { const [a, m] = partes(mes); return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7); };
  const diaSem = (s) => utc(s).getUTCDay();
  const ultimoDia = (mes) => { const [a, m] = partes(mes); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
  const nomeMes = (mes) => { const [a, m] = partes(mes); return `${MESES[m - 1]} ${a}`; };
  const dataLonga = (s) => { const [, m, d] = partes(s); return `${SEMANA[diaSem(s)]}, ${d} de ${MESES[m - 1]}`; };
  const dataCurta = (s) => s.split('-').reverse().join('/');
  const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

  const reais = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const fone = (n = '') => (n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}` : n);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

  const SETA = { anterior: 'm15 18-6-6 6-6', proxima: 'm9 18 6-6-6-6' };
  const seta = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="${d}"/></svg>`;

  // fetch com tempo máximo: conexão travada vira erro em vez de "carregando" para sempre
  const buscarJSON = async (url, opcoes = {}, ms = 15000) => {
    const r = await fetch(url, { ...opcoes, signal: AbortSignal.timeout(ms) });
    const j = await r.json().catch(() => ({}));
    return { r, j };
  };

  window.Aconchego = {
    MESES, SEMANA, SETA, api, pad, partes, somaDias, somaMeses, diaSem, ultimoDia, nomeMes, dataLonga, dataCurta,
    hojeLocal, reais, fone, esc, seta, buscarJSON,
  };
})();
