/* Aconchego · painel da dona (admin.html).
   A senha vai uma vez para a API, que devolve um token de sessão (12 h); só o token fica na sessão do navegador. */
(() => {
  // O painel só funciona no domínio próprio (a API não aceita o painel vindo de outro site)
  if (location.hostname.endsWith('github.io')) { location.replace('https://aconchegoeventos.pages.dev/admin.html'); return; }
  const { dataLonga, dataCurta, diaSem: diaSemana, reais, esc, fone, hojeLocal, SEMANA, buscarJSON } = window.Aconchego;
  const $ = (s, el = document) => el.querySelector(s);
  const CHAVE = 'aconchego-sessao';
  const API = window.Aconchego.api();
  const SITUACAO = {
    paga: 'Paga', pedido: 'Pedido pelo WhatsApp', confirmada: 'Confirmada', pendente: 'Aguardando pagamento', bloqueio: 'Bloqueio', conflito: 'Conflito: devolver',
    cancelada: 'Cancelada', expirada: 'Expirada', estornada: 'Estornada', substituida: 'Substituída',
  };
  const MOTIVO = {
    passado: 'Data passada.',
    antecedencia: 'Dentro da antecedência mínima: não aparece no site.',
    janela: 'Além do limite da agenda: ainda não aparece no site.',
    fechado: 'Dia fechado para reservas.',
  };
  const quando = (r) => (r.inicio === r.fim ? dataCurta(r.inicio) : `${dataCurta(r.inicio)} a ${dataCurta(r.fim)}`);
  const tri = (v) => (v === '1' ? true : v === '0' ? false : null);
  const sel = (v, alvo) => (v === alvo ? ' selected' : '');

  let token = '';
  try { token = sessionStorage.getItem(CHAVE) || ''; sessionStorage.removeItem('aconchego-admin'); } catch { /* sem sessão: pede a senha */ }
  let dados = null;
  let diaAberto = null;
  let cal = null;

  async function api(metodo, corpo, mes) {
    const { r, j } = await buscarJSON(`${API}/admin${mes ? `?mes=${mes}` : ''}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${token}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    }).catch(() => ({ r: null, j: {} }));
    if (!r) throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.');
    // Só a sessão inválida tira a dona do painel; queda de internet ou erro do servidor não
    if (r.status === 401) { sair(); throw new Error(j.erro || 'Sessão expirada. Entre de novo.'); }
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  }

  /* ── Entrar e sair ── */
  function sair() {
    token = '';
    try { sessionStorage.removeItem(CHAVE); } catch { /* ok */ }
    $('#painel').hidden = true;
    $('#sair').hidden = true;
    $('#login').hidden = false;
  }
  $('#sair').addEventListener('click', sair);

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    const botao = e.target.querySelector('button[type="submit"]');
    if (botao?.disabled) return;
    $('#login-msg').textContent = '';
    if (botao) botao.disabled = true;
    try {
      const { r, j } = await buscarJSON(`${API}/admin`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ acao: 'entrar', senha: e.target.elements.senha.value }),
      }).catch(() => ({ r: null, j: {} }));
      if (!r) throw new Error('Sem conexão com o servidor. Confira a internet e tente de novo.');
      if (!r.ok || !j.token) throw new Error(j.erro || 'Não foi possível entrar.');
      token = j.token;
      try { sessionStorage.setItem(CHAVE, token); } catch { /* ok */ }
      e.target.elements.senha.value = '';
      await entrar();
    } catch (err) { $('#login').hidden = false; $('#login-msg').textContent = err.message; }
    finally { if (botao) botao.disabled = false; }
  });

  async function entrar() {
    dados = await api('GET', null, cal?.mes || hojeLocal().slice(0, 7));
    $('#login').hidden = true;
    $('#painel').hidden = false;
    $('#sair').hidden = false;
    if (!cal) criaCalendario();
    cal.atualizar();
    configForm();
    tabela();
    avisos();
    pendencias();
  }

  // Problemas de configuração (ex.: falta segredo do Mercado Pago) ficam fixos no topo do painel
  function pendencias() {
    const lista = dados?.pendencias || [];
    let caixa = $('#adm-pendencias');
    if (!lista.length) { caixa?.remove(); return; }
    if (!caixa) {
      caixa = document.createElement('p');
      caixa.id = 'adm-pendencias';
      caixa.className = 'nota';
      caixa.setAttribute('role', 'status');
      $('#painel').prepend(caixa);
    }
    caixa.textContent = lista.join(' ');
  }

  // Ao redesenhar o painel, o botão focado é recriado: guarda qual era para devolver o foco a ele
  const ATRIBUTOS_FOCO = ['data-confirmar', 'data-cancelar', 'data-liberar', 'data-rapido', 'data-bloquear', 'name'];
  function lembrarFoco() {
    const el = document.activeElement;
    if (!el || !el.closest('#adm-dia, #adm-reservas')) return null;
    const attr = ATRIBUTOS_FOCO.find((a) => el.hasAttribute(a));
    return attr ? `${el.closest('#adm-dia') ? '#adm-dia' : '#adm-reservas'} [${attr}="${CSS.escape(el.getAttribute(attr))}"]` : null;
  }
  const devolverFoco = (seletor) => { if (seletor) $(seletor)?.focus({ preventScroll: true }); };

  async function recarregar(manterEditor = false) {
    const foco = lembrarFoco();
    dados = await api('GET', null, cal.mes);
    cal.atualizar();
    tabela();
    avisos();
    pendencias();
    const d = diaAberto && dados.dias.find((x) => x.data === diaAberto);
    if (d && !manterEditor) editor(d);
    devolverFoco(foco);
  }

  /* ── 1. Calendário + editor do dia ── */
  function criaCalendario() {
    cal = window.AconchegoCalendario($('#adm-cal'), {
      mes: dados.mes,
      hoje: dados.hoje,
      rotulo: 'Use as setas para mudar de dia e Enter para editar.',
      estado: (data) => {
        const d = dados?.mes === data.slice(0, 7) && dados.dias.find((x) => x.data === data);
        if (!d) return { classe: 'is-carregando', rotulo: 'carregando', ativo: false };
        let e = d.reserva?.status === 'pedido' ? ['is-pendente', 'pedido pelo WhatsApp']
          : d.status === 'reservado' ? ['is-reservado', 'reservado']
          : d.status === 'pendente' ? ['is-pendente', 'aguardando pagamento']
            : d.status === 'livre' ? ['is-disponivel', 'aberto'] : ['is-indisponivel', 'fechado'];
        if (d.feriado || d.ajuste) e = [`${e[0]} tem-excecao`, `${e[1]}${d.feriado ? ', feriado' : ', com ajuste'}`];
        return { classe: e[0], rotulo: e[1], ativo: true };
      },
      aoMes: async () => { try { await recarregar(); $('#adm-msg').textContent = ''; } catch (err) { avisoDia(err.message); } },
      aoEscolher: (data) => {
        diaAberto = data;
        const d = dados.dias.find((x) => x.data === data);
        if (d) editor(d);
      },
    });
  }

  const form = $('#adm-dia');
  // Sem dia aberto, o aviso vai para a mensagem fixa acima do calendário
  const avisoDia = (t, ok) => {
    const m = $('.agenda-msg', form), o = $('.adm-ok', form);
    if (!m) { $('#adm-msg').textContent = ok ? '' : t; return; }
    m.textContent = ok ? '' : t;
    if (o) o.textContent = ok ? t : '';
  };

  function editor(d) {
    const aj = d.ajuste || {};
    const c = dados.config;
    const padraoAberto = c.semana[diaSemana(d.data)];
    const fechado = d.motivo === 'fechado';
    const r = d.reserva;
    const seloTxt = r ? (SITUACAO[r.status] || r.status) : d.status === 'livre' ? 'Livre' : 'Fechado';
    const seloCls = r ? r.status : d.status === 'livre' ? 'livre' : '';
    const valorAuto = d.feriado ? c.precoFeriado : c.precoDiaria;
    form.innerHTML = `
      <p class="agenda-passo">${esc(dataLonga(d.data))}</p>
      <div class="adm-periodo-topo"><span class="selo is-${seloCls}">${esc(seloTxt)}</span>${d.feriado ? `<span class="selo">Feriado${d.nomeFeriado ? `: ${esc(d.nomeFeriado)}` : ''}</span>` : ''}</div>
      ${MOTIVO[d.motivo] ? `<p class="nota">${MOTIVO[d.motivo]}</p>` : ''}
      ${r ? `<div class="adm-periodo">
        <p class="adm-cliente"><b>${esc(r.nome)}</b>${r.whatsapp ? ` · <a href="https://wa.me/55${esc(r.whatsapp)}" target="_blank" rel="noopener">${esc(fone(r.whatsapp))}</a>` : ''}${r.valor ? ` · ${reais(r.valor)}` : ''}<br>Reserva: ${esc(quando(r))}</p>
        ${r.status === 'bloqueio' ? `<div><button type="button" class="btn btn-linha c-azul btn-mini" data-liberar="${esc(r.id)}">Liberar bloqueio</button></div>` : ''}
        ${r.status === 'pedido' ? `<div class="acoes"><button type="button" class="btn btn-azul btn-mini" data-confirmar="${esc(r.id)}">Confirmar reserva</button><button type="button" class="btn btn-linha c-azul btn-mini" data-liberar="${esc(r.id)}">Recusar pedido</button></div>` : ''}
      </div>` : ''}
      <div class="acoes"><button type="button" class="btn ${fechado ? 'btn-azul' : 'btn-linha c-azul'} btn-mini" data-rapido="${fechado ? 1 : 0}">${fechado ? 'Abrir este dia' : 'Fechar este dia'}</button></div>
      <label class="campo"><span>Este dia</span><select name="aberto">
        <option value="">Igual ao padrão de ${SEMANA[diaSemana(d.data)].toLowerCase()} (${padraoAberto ? 'aberto' : 'fechado'})</option>
        <option value="1"${sel(aj.aberto, 1)}>Aberto</option>
        <option value="0"${sel(aj.aberto, 0)}>Fechado</option>
      </select></label>
      <label class="campo"><span>Feriado</span><select name="feriado">
        <option value="">Automático (${d.nomeFeriado ? `sim: ${esc(d.nomeFeriado)}` : 'não'})</option>
        <option value="1"${sel(aj.feriado, 1)}>É feriado</option>
        <option value="0"${sel(aj.feriado, 0)}>Não é feriado</option>
      </select></label>
      <label class="campo"><span>Preço só desta data (R$)</span><input type="number" min="0" step="1" inputmode="decimal" name="preco" value="${esc(aj.preco ?? '')}" placeholder="Padrão: ${reais(valorAuto)}"></label>
      <p class="agenda-msg" role="alert"></p>
      <p class="adm-ok" role="status"></p>
      <div class="acoes"><button class="btn btn-azul" type="submit">Salvar este dia</button></div>
      ${r ? '' : `
      <div><button type="button" class="btn btn-linha c-azul btn-mini" data-abrir-bloq aria-expanded="false" aria-controls="adm-bloq">Bloquear (reserva fechada pelo WhatsApp)</button></div>
      <div class="adm-bloq adm-periodo" id="adm-bloq" hidden>
        <label class="campo"><span>Nome do cliente</span><input name="bnome" maxlength="80"></label>
        <label class="campo"><span>WhatsApp (opcional)</span><input name="bwhats" type="tel" inputmode="tel"></label>
        <label class="campo"><span>Quantos dias a partir deste</span><input name="bdias" type="number" min="1" max="14" step="1" value="1"></label>
        <label class="campo"><span>Valor combinado (opcional)</span><input name="bvalor" type="number" min="0" step="1" inputmode="decimal"></label>
        <div><button type="button" class="btn btn-azul btn-mini" data-bloquear>Confirmar bloqueio</button></div>
      </div>`}`;
  }

  const lerDia = (abertoForcado) => ({
    acao: 'dia',
    data: diaAberto,
    aberto: abertoForcado !== undefined ? abertoForcado : tri(form.elements.aberto.value),
    feriado: tri(form.elements.feriado.value),
    preco: form.elements.preco.value,
  });

  // Trava os botões do dia enquanto envia: clique duplo não manda o mesmo pedido duas vezes
  let enviando = false;
  async function acaoDia(corpo, ok) {
    if (enviando) return;
    enviando = true;
    const botoes = [...form.querySelectorAll('button')];
    botoes.forEach((b) => { b.disabled = true; });
    try {
      await api('POST', corpo);
    } catch (err) {
      avisoDia(err.message);
      enviando = false;
      botoes.forEach((b) => { if (b.isConnected) b.disabled = false; });
      return;
    }
    // A ação já foi feita: se só a atualização da tela falhar, avisa sem dizer que deu erro na ação
    try {
      await recarregar();
      avisoDia(ok, true);
    } catch (err) {
      avisoDia(`${ok} A tela não atualizou (${err.message}); recarregue a página antes de mexer de novo.`, true);
    } finally {
      enviando = false;
      botoes.forEach((b) => { if (b.isConnected) b.disabled = false; });
    }
  }

  form.addEventListener('submit', (e) => { e.preventDefault(); if (diaAberto) acaoDia(lerDia(), 'Dia salvo.'); });
  form.addEventListener('click', (e) => {
    const b = e.target.closest('button[type="button"]');
    if (!b) return;
    if (b.dataset.rapido !== undefined) acaoDia(lerDia(b.dataset.rapido === '1'), b.dataset.rapido === '1' ? 'Dia aberto.' : 'Dia fechado.');
    else if (b.hasAttribute('data-abrir-bloq')) {
      const caixa = $('#adm-bloq', form);
      caixa.hidden = !caixa.hidden;
      b.setAttribute('aria-expanded', String(!caixa.hidden));
      if (!caixa.hidden) $('input', caixa).focus();
    } else if (b.hasAttribute('data-bloquear')) {
      const f = form.elements;
      acaoDia({ acao: 'bloquear', inicio: diaAberto, dias: f.bdias.value, nome: f.bnome.value, whatsapp: f.bwhats.value, valor: f.bvalor.value }, 'Data bloqueada.');
    } else if (b.dataset.confirmar) acaoDia({ acao: 'confirmar', id: b.dataset.confirmar }, 'Reserva confirmada.');
    else if (b.dataset.liberar) acaoDia({ acao: 'cancelar', id: b.dataset.liberar }, 'Dias liberados.');
  });

  /* ── 2. Lista de reservas ── */
  function tabela() {
    const filtro = $('#adm-filtro').value;
    let lista = dados.reservas;
    if (filtro === 'proximas') lista = lista.filter((r) => r.fim >= dados.hoje && ['paga', 'pedido', 'confirmada', 'pendente', 'bloqueio', 'conflito'].includes(r.situacao));
    else if (filtro !== 'todas') lista = lista.filter((r) => r.situacao === filtro);
    const caixa = $('#adm-reservas');
    if (!lista.length) { caixa.innerHTML = '<p class="adm-vazio">Nenhuma reserva aqui.</p>'; return; }
    caixa.innerHTML = `<table class="adm-tabela">
      <thead><tr><th scope="col">Data</th><th scope="col">Cliente</th><th scope="col">WhatsApp</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${lista.map((r) => {
        const pode = ['pedido', 'confirmada', 'pendente', 'conflito', 'bloqueio'].includes(r.situacao);
        return `<tr>
          <td><b>${esc(quando(r))}</b><br><small>${SEMANA[diaSemana(r.inicio)]}${r.inicio !== r.fim ? ` a ${SEMANA[diaSemana(r.fim)].toLowerCase()}` : ''}</small></td>
          <td>${esc(r.nome)}${r.obs ? `<br><small>${esc(r.obs)}</small>` : ''}</td>
          <td>${r.whatsapp ? `<a href="https://wa.me/55${esc(r.whatsapp)}" target="_blank" rel="noopener">${esc(fone(r.whatsapp))}</a>` : '-'}</td>
          <td>${r.valor ? reais(r.valor_pago ?? r.valor) : '-'}${r.detalhe ? `<br><small>${esc(r.detalhe)}</small>` : ''}</td>
          <td><span class="selo is-${esc(r.situacao)}">${SITUACAO[r.situacao] || esc(r.situacao)}</span></td>
          <td class="acoes">${r.situacao === 'pedido' ? `<button type="button" class="btn btn-azul btn-mini" data-confirmar="${esc(r.id)}">Confirmar</button>` : ''}${pode ? `<button type="button" class="btn btn-linha c-azul btn-mini" data-cancelar="${esc(r.id)}">${r.situacao === 'bloqueio' ? 'Liberar' : 'Cancelar'}</button>` : ''}${r.situacao === 'paga' ? `<button type="button" class="btn btn-linha c-azul btn-mini" data-cancelar="${esc(r.id)}" data-devolvido="1" title="Use só depois de devolver o dinheiro no Mercado Pago">Já devolvi: liberar</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }
  $('#adm-filtro').addEventListener('change', tabela);

  // Ação da lista: trava o botão, mostra o erro na mensagem do topo e devolve o texto original do botão
  async function acaoLista(botao, corpo) {
    botao.disabled = true;
    $('#adm-msg').textContent = '';
    try { await api('POST', corpo); } catch (err) {
      $('#adm-msg').textContent = err.message;
      if (botao.isConnected) { botao.disabled = false; botao.textContent = botao.dataset.texto || botao.textContent; delete botao.dataset.certeza; }
      return;
    }
    try { await recarregar(); } catch (err) { $('#adm-msg').textContent = `Feito, mas a lista não atualizou (${err.message}). Recarregue a página.`; }
    if (botao.isConnected) botao.disabled = false;
  }

  // Cancelar pede um segundo clique para confirmar
  $('#adm-reservas').addEventListener('click', async (e) => {
    const c = e.target.closest('[data-confirmar]');
    if (c) {
      if (c.disabled) return;
      c.dataset.texto = c.textContent;
      await acaoLista(c, { acao: 'confirmar', id: c.dataset.confirmar });
      return;
    }
    const b = e.target.closest('[data-cancelar]');
    if (!b) return;
    if (b.disabled) return;
    if (!b.dataset.certeza) {
      b.dataset.certeza = '1';
      b.dataset.texto = b.textContent;
      b.textContent = 'Confirmar?';
      setTimeout(() => { if (b.isConnected && !b.disabled) { delete b.dataset.certeza; b.textContent = b.dataset.texto; } }, 4000);
      return;
    }
    await acaoLista(b, { acao: 'cancelar', id: b.dataset.cancelar, ...(b.dataset.devolvido ? { jaDevolvido: true } : {}) });
  });

  /* ── Avisos (pedidos novos, pagamentos, conflitos) ── */
  function avisos() {
    const lista = dados.avisos || [];
    const novos = lista.filter((a) => !a.lido).length;
    $('#avisos-n').textContent = novos ? `(${novos})` : '';
    document.title = `${novos ? `(${novos}) ` : ''}Agenda · Aconchego Festas e Eventos`;
    $('#avisos-lidos').hidden = !novos;
    $('#adm-avisos').innerHTML = lista.length ? lista.map((a) => {
      const [titulo, ...resto] = a.texto.split('\n');
      const quandoFoi = new Date(a.em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
      return `<li class="${a.lido ? '' : 'is-novo'}"><small>${esc(quandoFoi)}${a.lido ? '' : ' · novo'}</small><b>${esc(titulo)}</b><span>${esc(resto.join(' '))}</span></li>`;
    }).join('') : '<li><span>Nenhum aviso ainda. Pedidos e pagamentos novos aparecem aqui.</span></li>';
  }
  $('#avisos-lidos').addEventListener('click', async (e) => {
    const botao = e.currentTarget;
    if (botao.disabled) return;
    botao.dataset.texto = botao.textContent;
    await acaoLista(botao, { acao: 'lidos' });
  });
  // Confere novidades a cada 2 minutos enquanto o painel está aberto (sem empilhar pedidos se a rede estiver lenta)
  let conferindo = false;
  setInterval(() => {
    if (!token || document.hidden || !cal || conferindo || enviando) return;
    conferindo = true;
    recarregar(true).catch(() => {}).finally(() => { conferindo = false; });
  }, 120000);

  /* ── 3. Preços e regras ── */
  const cfgForm = $('#adm-config');
  const CAMPOS = ['precoDiaria', 'precoFeriado', 'precoPacote', 'antecedenciaDias', 'mesesAFrente', 'maxDias'];

  function configForm() {
    const c = dados.config;
    const semana = $('#cfg-semana');
    semana.querySelectorAll('.chk').forEach((el) => el.remove());
    SEMANA.forEach((s, i) => semana.insertAdjacentHTML('beforeend',
      `<label class="chk"><input type="checkbox" name="semana-${i}"${c.semana[i] ? ' checked' : ''}> ${s}</label>`));
    CAMPOS.forEach((k) => { cfgForm.elements[k].value = c[k]; });
  }

  cfgForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#cfg-msg').textContent = '';
    $('#cfg-ok').textContent = '';
    // Campo vazio não vira R$ 0: com preço zerado o site recusaria todas as reservas
    const config = {};
    for (const k of CAMPOS) {
      const el = cfgForm.elements[k];
      const valor = el.value.trim();
      const minimo = k.startsWith('preco') ? 1 : Number(el.min || 0);
      const maximo = k.startsWith('preco') ? 100000 : Number(el.max || Infinity);
      const n = Number(valor);
      const inteiroOk = k.startsWith('preco') || Number.isInteger(n);
      if (valor === '' || !Number.isFinite(n) || n < minimo || n > maximo || !inteiroOk) {
        $('#cfg-msg').textContent = k.startsWith('preco')
          ? 'Preencha todos os preços com valores entre R$ 1 e R$ 100.000.'
          : `Use um número inteiro entre ${minimo} e ${maximo} em "${el.closest('label')?.querySelector('span')?.textContent || k}".`;
        el.setAttribute('aria-invalid', 'true');
        el.focus();
        return;
      }
      el.removeAttribute('aria-invalid');
      config[k] = Number(valor);
    }
    config.semana = SEMANA.map((_, i) => cfgForm.elements[`semana-${i}`].checked);
    const botao = cfgForm.querySelector('button[type="submit"]');
    if (botao?.disabled) return;
    if (botao) botao.disabled = true;
    try {
      await api('POST', { acao: 'config', config });
      $('#cfg-ok').textContent = 'Padrões salvos.';
      try { await recarregar(); configForm(); } catch (err) { $('#cfg-ok').textContent = `Padrões salvos, mas a tela não atualizou (${err.message}).`; }
    } catch (err) { $('#cfg-msg').textContent = err.message; }
    finally { if (botao) botao.disabled = false; }
  });

  // Sessão guardada: se a internet falhar, mostra o motivo em vez de sair calado
  if (token) {
    entrar().catch((err) => {
      $('#login').hidden = false;
      $('#login-msg').textContent = err.message;
    });
  }
})();
