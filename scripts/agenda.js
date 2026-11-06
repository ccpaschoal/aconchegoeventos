/* Aconchego · calendário de reservas (JS puro, sem bibliotecas).
   - window.AconchegoCalendario: componente de mês reaproveitado pelo admin.html
   - #agenda na página principal: dia → período → dados → Mercado Pago
   Datas sempre em texto AAAA-MM-DD para não sofrer com fuso horário. */
(() => {
  const {
    MESES, SEMANA, SETA, pad, partes, somaDias, somaMeses, diaSem, ultimoDia, nomeMes, dataLonga, reais, esc, hojeLocal, seta, buscarJSON,
  } = window.Aconchego;
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
        <button type="button" class="cal-nav" data-passo="-1" aria-label="Mês anterior">${seta(SETA.anterior)}</button>
        <h3 class="cal-mes" id="${id}-mes" aria-live="polite"></h3>
        <button type="button" class="cal-nav" data-passo="1" aria-label="Próximo mês">${seta(SETA.proxima)}</button>
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

  /* ── Reserva na página principal ──
     Aluguel por diária: o cliente escolhe um dia e depois quantos dias seguidos (até maxDias).
     A conta abaixo é só para mostrar; o valor cobrado é recalculado no servidor (worker/regras.js). */
  const raiz = document.getElementById('agenda');
  if (!raiz) return;
  const API = window.Aconchego.api();
  const WPP = raiz.dataset.whatsapp || '';
  const ESTADOS = {
    disponivel: { classe: 'is-disponivel', rotulo: 'disponível', ativo: true },
    reservado: { classe: 'is-reservado', rotulo: 'reservado', ativo: false },
    indisponivel: { classe: 'is-indisponivel', rotulo: 'indisponível', ativo: false },
  };

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
        <legend class="agenda-passo"><span aria-hidden="true">2</span> Quantos dias</legend>
        <div class="agenda-opcoes"></div>
      </fieldset>
      <fieldset class="agenda-dados" disabled>
        <legend class="agenda-passo"><span aria-hidden="true">3</span> Seus dados</legend>
        <label class="campo"><span>Nome</span><input name="nome" autocomplete="name" maxlength="80" required></label>
        <label class="campo"><span>WhatsApp</span><input name="whatsapp" type="tel" inputmode="tel" autocomplete="tel-national" placeholder="(62) 9 0000-0000" maxlength="16" required></label>
        <label class="agenda-isca" aria-hidden="true">Não preencha <input name="site" tabindex="-1" autocomplete="off"></label>
      </fieldset>
      <p class="agenda-resumo" aria-live="polite"></p>
      <p class="agenda-msg" role="alert" id="agenda-msg"></p>
      <button class="btn btn-azul agenda-pagar" type="submit" disabled>Avançar para pagamento</button>
      <p class="agenda-nota">Pix ou cartão pelo Mercado Pago. A data fica guardada por 30 minutos enquanto você paga.</p>
    </form>`;

  const form = raiz.querySelector('form');
  const diaTxt = form.querySelector('.agenda-dia');
  const fsOpc = form.querySelector('.agenda-periodos');
  const fsDados = form.querySelector('.agenda-dados');
  const opcoes = form.querySelector('.agenda-opcoes');
  const resumo = form.querySelector('.agenda-resumo');
  const msg = form.querySelector('.agenda-msg');
  const btn = form.querySelector('.agenda-pagar');
  const campo = (n) => form.elements[n];
  const cache = {};
  let info = null;      // última resposta da API (limites, pacote, máximo de dias)
  let lista = [];       // opções de dias para o dia clicado
  let intervalo = null; // opção escolhida { inicio, fim, datas, n, total, pacote, feriado }
  let TXT_BTN = 'Avançar para pagamento';

  const aviso = (t) => { msg.innerHTML = t; };
  const FORA_DO_AR = 'A agenda online não respondeu agora.';
  const foraDoAr = () => aviso(`${FORA_DO_AR} <button type="button" class="link-btn" data-tentar>Tentar de novo</button>${WPP ? ` ou <a href="${WPP}" target="_blank" rel="noopener">reserve pelo WhatsApp</a>.` : ''}`);
  msg.addEventListener('click', (e) => { if (e.target.closest('[data-tentar]')) carregar(cal.mes, true); });
  const diaDe = (data) => cache[data.slice(0, 7)]?.dias.find((d) => d.data === data);
  const curta = (s) => { const [, m, d] = partes(s); return `${d}/${pad(m)}`; };

  const cal = Calendario(raiz.querySelector('.cal-alvo'), {
    mes: hojeLocal().slice(0, 7),
    hoje: hojeLocal(),
    min: hojeLocal().slice(0, 7),
    rotulo: 'Use as setas para mudar de dia e Enter para escolher.',
    estado: (data) => {
      const d = diaDe(data);
      if (!d) return { classe: 'is-carregando', rotulo: 'carregando', ativo: false };
      const e = ESTADOS[d.status] || ESTADOS.indisponivel;
      // intervalo começa nulo, então cal só é lido depois de criado
      const dentro = intervalo && intervalo.datas.includes(data) && data !== cal.escolhido;
      return dentro ? { ...e, classe: `${e.classe} is-no-intervalo`, rotulo: `${e.rotulo}, incluído na reserva` } : e;
    },
    aoMes: (m) => carregar(m),
    aoEscolher: (data) => escolherDia(data),
  });

  async function buscar(mes) {
    const { r, j } = await buscarJSON(`${API}/disponibilidade?mes=${mes}`, { headers: { Accept: 'application/json' } });
    if (!r.ok || !Array.isArray(j.dias)) throw new Error(r.status);
    cache[j.mes] = j;
    return j;
  }

  async function carregar(mes, forcar) {
    if (cache[mes] && !forcar) return cal.atualizar();
    raiz.setAttribute('aria-busy', 'true');
    try {
      const j = await buscar(mes);
      if (!info) {
        cal.limites(j.de, j.ate);
        if (j.pagamento === 'whatsapp') {
          btn.textContent = TXT_BTN = 'Enviar pedido pelo WhatsApp';
          form.querySelector('.agenda-nota').textContent = `Você confirma a reserva e combina o pagamento com a gente pelo WhatsApp. A data fica guardada por ${j.horasPedido} horas.`;
        }
      }
      info = j;
      if (msg.textContent.startsWith(FORA_DO_AR)) aviso('');
    } catch {
      foraDoAr();
    } finally {
      raiz.removeAttribute('aria-busy');
      cal.atualizar();
    }
  }

  /* Mesma regra do servidor: sexta+sábado ou sábado+domingo sem feriado = pacote */
  function preco(dias) {
    let total = 0, pacote = false;
    const ok = (a, b) => info.precoPacote > 0 && !a.feriado && !b.feriado && !a.especial && !b.especial
      && ((diaSem(a.data) === 5 && diaSem(b.data) === 6) || (diaSem(a.data) === 6 && diaSem(b.data) === 0));
    for (let i = 0; i < dias.length; i++) {
      if (dias[i + 1] && ok(dias[i], dias[i + 1])) { total += info.precoPacote; pacote = true; i++; } else total += dias[i].preco;
    }
    return { total, pacote };
  }

  /* Todas as combinações de dias seguidos (1 até maxDias) que incluem o dia clicado e estão livres */
  function montarOpcoes(data) {
    const max = info?.maxDias || 1;
    const r = [];
    for (let n = 1; n <= max; n++) {
      for (let k = n - 1; k >= 0; k--) {
        const datas = Array.from({ length: n }, (_, i) => somaDias(data, i - k));
        const dias = datas.map(diaDe);
        if (dias.some((d) => !d || d.status !== 'disponivel')) continue;
        r.push({ inicio: datas[0], fim: datas[n - 1], datas, n, feriado: dias.some((d) => d.feriado), ...preco(dias) });
      }
    }
    return r;
  }

  const nomeOpcao = (o) => (o.n === 1 ? dataLonga(o.inicio)
    : `${SEMANA[diaSem(o.inicio)]} ${curta(o.inicio)} a ${SEMANA[diaSem(o.fim)].toLowerCase()} ${curta(o.fim)}`);

  async function escolherDia(data) {
    if (!diaDe(data)) return;
    // Combinações que viram o mês precisam do mês vizinho
    const max = info?.maxDias || 1;
    const meses = [somaDias(data, 1 - max).slice(0, 7), somaDias(data, max - 1).slice(0, 7)]
      .filter((m) => !cache[m] && (!info || (m >= info.de && m <= info.ate)));
    await Promise.all([...new Set(meses)].map((m) => buscar(m).catch(() => null)));
    lista = montarOpcoes(data);
    diaTxt.textContent = dataLonga(data);
    opcoes.innerHTML = lista.map((o, i) => `<label class="periodo">
        <input type="radio" name="opcao" value="${i}"${i === 0 ? ' checked' : ''}>
        <span class="periodo-nome">${o.n} ${o.n === 1 ? 'diária' : 'diárias'}</span>
        <span class="periodo-hora">${esc(nomeOpcao(o))}${o.pacote ? ' · pacote fim de semana' : ''}${o.feriado ? ' · feriado' : ''}</span>
        <span class="periodo-preco">${reais(o.total)}</span>
      </label>`).join('');
    fsOpc.disabled = false;
    fsDados.disabled = false;
    aviso('');
    atualizaResumo();
    if (matchMedia('(max-width: 820px)').matches) fsOpc.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  function atualizaResumo() {
    intervalo = lista[Number(form.querySelector('input[name="opcao"]:checked')?.value)] || null;
    resumo.textContent = intervalo ? `${nomeOpcao(intervalo)} · ${reais(intervalo.total)}` : '';
    btn.disabled = !intervalo;
    cal.atualizar();
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'opcao') atualizaResumo(); });

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
    el.setAttribute('aria-describedby', 'agenda-msg'); // o leitor de tela lê o erro junto com o campo
    el.focus();
    aviso(esc(texto));
    return false;
  }
  form.addEventListener('input', (e) => { e.target.removeAttribute?.('aria-invalid'); e.target.removeAttribute?.('aria-describedby'); });

  // Só sai do site para o WhatsApp ou para o Mercado Pago, nunca para um endereço inesperado
  const destinoSeguro = (url, tipo) => {
    try {
      const u = new URL(url);
      if (u.protocol !== 'https:') return false;
      return tipo === 'whatsapp' ? u.hostname === 'wa.me' : /(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname);
    } catch { return false; }
  };

  function valida() {
    const whats = campo('whatsapp').value.replace(/\D/g, '');
    if (campo('nome').value.trim().length < 3) return erroCampo('nome', 'Informe seu nome.');
    if (whats.length < 10 || whats.length > 11) return erroCampo('whatsapp', 'Informe o WhatsApp com DDD.');
    return true;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    aviso('');
    if (!intervalo) return aviso('Escolha o dia e quantos dias.');
    if (!valida()) return;
    const escolha = intervalo;
    btn.disabled = true;
    btn.textContent = j0Texto();
    try {
      const { r, j } = await buscarJSON(`${API}/criar-reserva`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inicio: escolha.inicio, dias: escolha.n, nome: campo('nome').value.trim(),
          whatsapp: campo('whatsapp').value, site: campo('site').value,
        }),
      }, 30000).catch(() => ({ r: null, j: {} }));
      const destino = j.whatsapp ? destinoSeguro(j.whatsapp, 'whatsapp') : destinoSeguro(j.init_point, 'mercadopago');
      if (!r || !r.ok || !destino) {
        if (r?.status === 409) {
          await Promise.all([...new Set(escolha.datas.map((d) => d.slice(0, 7)))].map((m) => carregar(m, true)));
          if (diaDe(cal.escolhido)?.status === 'disponivel') await escolherDia(cal.escolhido);
        }
        throw new Error(j.erro || 'Não foi possível continuar agora. Tente de novo em instantes.');
      }
      try {
        localStorage.setItem('aconchego-reserva', JSON.stringify({
          id: j.id, quando: nomeOpcao(escolha),
          periodo: `${escolha.n} ${escolha.n === 1 ? 'diária' : 'diárias'}${escolha.pacote ? ' · pacote fim de semana' : ''}`,
          horario: '', valor: j.valor ?? escolha.total, link: j.init_point, expiraEm: j.expiraEm,
        }));
      } catch { /* sem armazenamento: as páginas de retorno funcionam sem o resumo */ }
      if (j.whatsapp) {
        // Pedido registrado: a data fica guardada e o cliente segue para o WhatsApp do salão
        resumo.textContent = `Pedido registrado! ${nomeOpcao(escolha)} fica guardado para você. Abrindo o WhatsApp…`;
        btn.textContent = 'Abrir o WhatsApp de novo';
        btn.disabled = false;
        btn.onclick = (ev) => { ev.preventDefault(); location.href = j.whatsapp; };
        location.href = j.whatsapp;
        return;
      }
      location.href = j.init_point;
    } catch (err) {
      aviso(esc(err.message));
      btn.textContent = TXT_BTN;
      btn.disabled = !intervalo;
    }
  });

  const j0Texto = () => (info?.pagamento === 'whatsapp' ? 'Registrando pedido…' : 'Abrindo pagamento…');
  carregar(cal.mes);

  // Voltando de erro.html (index.html#reservar), abre direto a tela de reserva
  if (location.hash === '#reservar') {
    addEventListener('load', () => document.querySelector('.nav a[href="#reservar"]')?.click());
  }
})();
