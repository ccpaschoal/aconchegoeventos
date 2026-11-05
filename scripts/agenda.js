/* Aconchego · calendário de reservas (JS puro, sem bibliotecas).
   - window.AconchegoCalendario: componente de mês reaproveitado pelo admin.html
   - #agenda na página principal: dia → período → dados → Mercado Pago
   Datas sempre em texto AAAA-MM-DD para não sofrer com fuso horário. */
(() => {
  const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const pad = (n) => String(n).padStart(2, '0');
  const partes = (s) => s.split('-').map(Number);
  const utc = (s) => { const [a, m, d] = partes(s); return new Date(Date.UTC(a, m - 1, d || 1)); };
  const somaDias = (s, n) => new Date(utc(s).getTime() + n * 864e5).toISOString().slice(0, 10);
  const somaMeses = (mes, n) => { const [a, m] = partes(mes); return new Date(Date.UTC(a, m - 1 + n, 1)).toISOString().slice(0, 7); };
  const diaSem = (s) => utc(s).getUTCDay();
  const ultimoDia = (mes) => { const [a, m] = partes(mes); return new Date(Date.UTC(a, m, 0)).getUTCDate(); };
  const nomeMes = (mes) => { const [a, m] = partes(mes); return `${MESES[m - 1]} ${a}`; };
  const dataLonga = (s) => { const [, m, d] = partes(s); return `${SEMANA[diaSem(s)]}, ${d} de ${MESES[m - 1]}`; };
  const reais = (v) => Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const hojeLocal = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const seta = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="${d}"/></svg>`;
  let uid = 0;

  /* ── Componente de calendário ──
     op: { mes, hoje, min, max, estado(data) → { classe, rotulo, ativo }, aoMes(mes), aoEscolher(data), rotulo } */
  function Calendario(raiz, op) {
    const id = `cal-${++uid}`;
    let mes = op.mes;
    let foco = null;
    let escolhido = null;
    raiz.classList.add('cal');
    raiz.innerHTML = `
      <div class="cal-topo">
        <button type="button" class="cal-nav" data-passo="-1" aria-label="Mês anterior">${seta('m15 18-6-6 6-6')}</button>
        <h3 class="cal-mes" id="${id}-mes" aria-live="polite"></h3>
        <button type="button" class="cal-nav" data-passo="1" aria-label="Próximo mês">${seta('m9 18 6-6-6-6')}</button>
      </div>
      <table class="cal-grade" role="grid" aria-labelledby="${id}-mes"${op.rotulo ? ` aria-describedby="${id}-dica"` : ''}>
        <thead><tr>${SEMANA.map((s) => `<th scope="col"><span aria-hidden="true">${s[0]}</span><span class="sr-only">${s}</span></th>`).join('')}</tr></thead>
        <tbody></tbody>
      </table>
      ${op.rotulo ? `<p class="sr-only" id="${id}-dica">${esc(op.rotulo)}</p>` : ''}`;
    const titulo = raiz.querySelector('.cal-mes');
    const [ant, prox] = raiz.querySelectorAll('.cal-nav');
    const tbody = raiz.querySelector('tbody');

    const dentro = (m) => (!op.min || m >= op.min) && (!op.max || m <= op.max);
    const focar = () => tbody.querySelector(`[data-data="${foco}"]`)?.focus();

    function desenha() {
      const tinhaFoco = tbody.contains(document.activeElement);
      titulo.textContent = nomeMes(mes);
      ant.disabled = !!op.min && mes <= op.min;
      prox.disabled = !!op.max && mes >= op.max;
      if (!foco || foco.slice(0, 7) !== mes) {
        foco = escolhido?.slice(0, 7) === mes ? escolhido
          : op.hoje?.slice(0, 7) === mes ? op.hoje : `${mes}-01`;
      }
      const [a, m] = partes(mes);
      const inicio = diaSem(`${mes}-01`);
      const total = ultimoDia(mes);
      const vazio = '<td role="gridcell" class="cal-vazio"></td>';
      let html = `<tr>${vazio.repeat(inicio)}`;
      for (let d = 1; d <= total; d++) {
        const data = `${mes}-${pad(d)}`;
        const e = op.estado(data) || {};
        if ((inicio + d - 1) % 7 === 0 && d !== 1) html += '</tr><tr>';
        const sel = data === escolhido;
        html += `<td role="gridcell"${sel ? ' aria-selected="true"' : ''}><button type="button" class="cal-dia ${e.classe || ''}${data === op.hoje ? ' is-hoje' : ''}${sel ? ' is-escolhido' : ''}" data-data="${data}" tabindex="${data === foco ? 0 : -1}" aria-label="${d} de ${MESES[m - 1]} de ${a}${e.rotulo ? `, ${esc(e.rotulo)}` : ''}${data === op.hoje ? ', hoje' : ''}"${e.ativo ? '' : ' aria-disabled="true"'}>${d}</button></td>`;
      }
      html += `${vazio.repeat((7 - ((inicio + total) % 7)) % 7)}</tr>`;
      tbody.innerHTML = html;
      if (tinhaFoco) focar();
    }

    function irPara(m, comFoco) {
      if (!dentro(m)) return;
      mes = m;
      desenha();
      if (comFoco) focar();
      op.aoMes?.(m);
    }

    ant.addEventListener('click', () => irPara(somaMeses(mes, -1)));
    prox.addEventListener('click', () => irPara(somaMeses(mes, 1)));

    tbody.addEventListener('click', (e) => {
      const b = e.target.closest('.cal-dia');
      if (!b) return;
      foco = b.dataset.data;
      if (b.getAttribute('aria-disabled') === 'true') { desenha(); focar(); return; }
      escolhido = foco;
      desenha();
      focar();
      op.aoEscolher?.(escolhido);
    });

    // Setas, Home/End e PageUp/PageDown (e não deixa o app.js trocar de tela enquanto isso)
    tbody.addEventListener('keydown', (e) => {
      const b = e.target.closest('.cal-dia');
      if (!b) return;
      const dt = b.dataset.data;
      const passos = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
      let alvo;
      if (e.key in passos) alvo = somaDias(dt, passos[e.key]);
      else if (e.key === 'Home') alvo = somaDias(dt, -diaSem(dt));
      else if (e.key === 'End') alvo = somaDias(dt, 6 - diaSem(dt));
      else if (e.key === 'PageUp' || e.key === 'PageDown') {
        const m = somaMeses(dt.slice(0, 7), e.key === 'PageUp' ? -1 : 1);
        alvo = `${m}-${pad(Math.min(partes(dt)[2], ultimoDia(m)))}`;
      } else return;
      e.preventDefault();
      e.stopPropagation();
      if (!dentro(alvo.slice(0, 7))) return;
      foco = alvo;
      if (alvo.slice(0, 7) !== mes) irPara(alvo.slice(0, 7), true);
      else { desenha(); focar(); }
    });

    desenha();
    return {
      atualizar: desenha,
      irPara,
      get mes() { return mes; },
      get escolhido() { return escolhido; },
      escolher(data) { escolhido = data; if (data) foco = data; desenha(); },
      limites(min, max) { op.min = min; op.max = max; desenha(); },
    };
  }

  window.AconchegoCalendario = Calendario;
  window.AconchegoData = { somaMeses, dataLonga, nomeMes, reais, esc, hojeLocal, MESES, SEMANA };

  /* ── Reserva na página principal ── */
  const raiz = document.getElementById('agenda');
  if (!raiz) return;
  const API = raiz.dataset.api || '/api';
  const WPP = raiz.dataset.whatsapp || '';
  const ESTADOS = {
    disponivel: { classe: 'is-disponivel', rotulo: 'disponível', ativo: true },
    reservado: { classe: 'is-reservado', rotulo: 'reservado', ativo: false },
    indisponivel: { classe: 'is-indisponivel', rotulo: 'indisponível', ativo: false },
  };
  const STATUS_PERIODO = { reservado: 'Reservado', pendente: 'Em reserva', fechado: 'Indisponível' };

  raiz.innerHTML = `
    <div class="agenda-cal">
      <div class="cal-alvo"></div>
      <ul class="cal-legenda" aria-label="Legenda do calendário">
        <li><span class="cal-amostra is-disponivel"></span>Disponível</li>
        <li><span class="cal-amostra is-reservado"></span>Reservado</li>
        <li><span class="cal-amostra is-indisponivel"></span>Indisponível</li>
      </ul>
    </div>
    <form class="agenda-painel" novalidate>
      <p class="agenda-passo"><span aria-hidden="true">1</span> Dia</p>
      <p class="agenda-dia" aria-live="polite">Escolha um dia azul no calendário.</p>
      <fieldset class="agenda-periodos" disabled>
        <legend class="agenda-passo"><span aria-hidden="true">2</span> Período</legend>
        <div class="agenda-opcoes"></div>
      </fieldset>
      <fieldset class="agenda-dados" disabled>
        <legend class="agenda-passo"><span aria-hidden="true">3</span> Seus dados</legend>
        <label class="campo"><span>Nome</span><input name="nome" autocomplete="name" maxlength="80" required></label>
        <div class="agenda-linha">
          <label class="campo"><span>WhatsApp</span><input name="whatsapp" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(62) 9 0000-0000" maxlength="16" required></label>
          <label class="campo"><span>Convidados</span><input name="convidados" type="number" inputmode="numeric" min="1" step="1" required></label>
        </div>
        <label class="agenda-isca" aria-hidden="true">Não preencha <input name="site" tabindex="-1" autocomplete="off"></label>
      </fieldset>
      <p class="agenda-resumo" aria-live="polite"></p>
      <p class="agenda-msg" role="alert"></p>
      <button class="btn btn-azul agenda-pagar" type="submit" disabled>Avançar para pagamento</button>
      <p class="agenda-nota">Pix ou cartão pelo Mercado Pago. A data fica guardada por 30 minutos enquanto você paga.</p>
    </form>`;

  const form = raiz.querySelector('form');
  const diaTxt = form.querySelector('.agenda-dia');
  const fsPer = form.querySelector('.agenda-periodos');
  const fsDados = form.querySelector('.agenda-dados');
  const opcoes = form.querySelector('.agenda-opcoes');
  const resumo = form.querySelector('.agenda-resumo');
  const msg = form.querySelector('.agenda-msg');
  const btn = form.querySelector('.agenda-pagar');
  const campo = (n) => form.elements[n];
  const cache = {};
  let info = null;   // última resposta da API (limites, máximo de convidados)
  let dia = null;    // dia escolhido
  let carregando = null;

  const aviso = (t) => { msg.innerHTML = t; };
  const foraDoAr = () => aviso(`A agenda online não respondeu agora.${WPP ? ` <a href="${WPP}" target="_blank" rel="noopener">Reserve pelo WhatsApp</a>.` : ''}`);
  const diaDe = (data) => cache[data.slice(0, 7)]?.dias.find((d) => d.data === data);

  const cal = Calendario(raiz.querySelector('.cal-alvo'), {
    mes: hojeLocal().slice(0, 7),
    hoje: hojeLocal(),
    min: hojeLocal().slice(0, 7),
    rotulo: 'Use as setas para mudar de dia e Enter para escolher.',
    estado: (data) => {
      const d = diaDe(data);
      if (!d) return { classe: 'is-carregando', rotulo: 'carregando', ativo: false };
      return ESTADOS[d.status] || ESTADOS.indisponivel;
    },
    aoMes: (m) => carregar(m),
    aoEscolher: (data) => escolherDia(data),
  });

  async function carregar(mes, forcar) {
    if (cache[mes] && !forcar) return cal.atualizar();
    raiz.setAttribute('aria-busy', 'true');
    const pedido = (carregando = fetch(`${API}/disponibilidade?mes=${mes}`, { headers: { Accept: 'application/json' } })
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(r.status)))));
    try {
      const j = await pedido;
      cache[j.mes] = j;
      if (!info) { cal.limites(j.de, j.ate); campo('convidados').max = j.maxConvidados; }
      info = j;
      if (msg.textContent.startsWith('A agenda online')) aviso('');
    } catch {
      foraDoAr();
    } finally {
      if (carregando === pedido) raiz.removeAttribute('aria-busy');
      cal.atualizar();
    }
  }

  function escolherDia(data) {
    dia = diaDe(data);
    if (!dia) return;
    diaTxt.textContent = dataLonga(data);
    const livres = dia.periodos.filter((p) => p.status === 'livre');
    opcoes.innerHTML = dia.periodos.map((p) => {
      const livre = p.status === 'livre';
      return `<label class="periodo${livre ? '' : ' is-off'}">
        <input type="radio" name="periodo" value="${esc(p.id)}"${livre ? '' : ' disabled'}${livres.length === 1 && livre ? ' checked' : ''}>
        <span class="periodo-nome">${esc(p.nome)}</span>
        <span class="periodo-hora">${esc(p.horario)}</span>
        <span class="periodo-preco">${livre ? reais(p.preco) : STATUS_PERIODO[p.status] || 'Indisponível'}</span>
      </label>`;
    }).join('');
    fsPer.disabled = false;
    fsDados.disabled = false;
    aviso('');
    atualizaResumo();
    if (matchMedia('(max-width: 820px)').matches) fsPer.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function periodoEscolhido() {
    const id = form.querySelector('input[name="periodo"]:checked')?.value;
    return dia?.periodos.find((p) => p.id === id && p.status === 'livre');
  }

  function atualizaResumo() {
    const p = periodoEscolhido();
    resumo.textContent = dia && p ? `${dataLonga(dia.data)} · ${p.nome} · ${reais(p.preco)}` : '';
    btn.disabled = !p;
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'periodo') atualizaResumo(); });

  // Máscara simples do WhatsApp: (62) 9 9999-9999
  campo('whatsapp').addEventListener('input', (e) => {
    const n = e.target.value.replace(/\D/g, '').slice(0, 11);
    let t = n;
    if (n.length > 2) t = `(${n.slice(0, 2)}) ${n.slice(2)}`;
    if (n.length > 6) t = n.length === 11
      ? `(${n.slice(0, 2)}) ${n.slice(2, 3)} ${n.slice(3, 7)}-${n.slice(7)}`
      : `(${n.slice(0, 2)}) ${n.slice(2, 6)}-${n.slice(6)}`;
    e.target.value = t;
  });

  function erroCampo(nome, texto) {
    const el = campo(nome);
    el.setAttribute('aria-invalid', 'true');
    el.focus();
    aviso(esc(texto));
    return false;
  }
  form.addEventListener('input', (e) => e.target.removeAttribute?.('aria-invalid'));

  function valida() {
    const max = info?.maxConvidados || 1000;
    const nome = campo('nome').value.trim();
    const whats = campo('whatsapp').value.replace(/\D/g, '');
    const conv = Number(campo('convidados').value);
    if (nome.length < 3) return erroCampo('nome', 'Informe seu nome.');
    if (whats.length < 10 || whats.length > 11) return erroCampo('whatsapp', 'Informe o WhatsApp com DDD.');
    if (!Number.isInteger(conv) || conv < 1 || conv > max) return erroCampo('convidados', `Informe de 1 a ${max} convidados.`);
    return true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    aviso('');
    const p = periodoEscolhido();
    if (!dia || !p) return aviso('Escolha o dia e o período.');
    if (!valida()) return;
    btn.disabled = true;
    btn.textContent = 'Abrindo pagamento…';
    try {
      const r = await fetch(`${API}/criar-reserva`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          data: dia.data, periodo: p.id, nome: campo('nome').value.trim(),
          whatsapp: campo('whatsapp').value, convidados: Number(campo('convidados').value), site: campo('site').value,
        }),
      }).catch(() => null);
      const j = r ? await r.json().catch(() => ({})) : {};
      if (!r || !r.ok || !j.init_point) {
        if (r?.status === 409) {
          await carregar(dia.data.slice(0, 7), true);
          escolherDia(dia.data);
        }
        throw new Error(j.erro || 'Não foi possível continuar agora. Tente de novo em instantes.');
      }
      try {
        localStorage.setItem('aconchego-reserva', JSON.stringify({
          id: j.id, data: dia.data, quando: dataLonga(dia.data), periodo: p.nome, horario: p.horario, valor: p.preco,
          link: j.init_point, expiraEm: j.expiraEm,
        }));
      } catch { /* sem armazenamento: as páginas de retorno funcionam sem o resumo */ }
      location.href = j.init_point;
    } catch (err) {
      aviso(esc(err.message));
      btn.textContent = 'Avançar para pagamento';
      atualizaResumo();
    }
  });

  carregar(cal.mes);

  // Voltando de erro.html (index.html#reservar), abre direto a tela de reserva
  if (location.hash === '#reservar') {
    addEventListener('load', () => document.querySelector('.nav a[href="#reservar"]')?.click());
  }
})();
