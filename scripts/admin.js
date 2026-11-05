/* Aconchego · painel da dona (admin.html).
   A senha só fica na sessão deste navegador e é conferida pela API (/api/admin). */
(() => {
  const { dataLonga, reais, esc, hojeLocal, SEMANA } = window.AconchegoData;
  const $ = (s, el = document) => el.querySelector(s);
  const CHAVE = 'aconchego-admin';
  const SITUACAO = {
    paga: 'Paga', pendente: 'Aguardando pagamento', bloqueio: 'Bloqueio', conflito: 'Conflito: devolver',
    cancelada: 'Cancelada', expirada: 'Expirada', estornada: 'Estornada', substituida: 'Substituída',
  };
  const MOTIVO = {
    passado: 'Data passada.',
    antecedencia: 'Dentro da antecedência mínima: não aparece no site.',
    janela: 'Além do limite da agenda: ainda não aparece no site.',
    fechado: 'Dia fechado para reservas.',
  };
  const fone = (n = '') => (n.length >= 10 ? `(${n.slice(0, 2)}) ${n.slice(2, -4)}-${n.slice(-4)}` : n);
  const dataCurta = (s) => s.split('-').reverse().join('/');
  const diaSemana = (s) => { const [a, m, d] = s.split('-').map(Number); return new Date(Date.UTC(a, m - 1, d)).getUTCDay(); };
  const quando = (r) => (r.inicio === r.fim ? dataCurta(r.inicio) : `${dataCurta(r.inicio)} a ${dataCurta(r.fim)}`);
  const tri = (v) => (v === '1' ? true : v === '0' ? false : null);
  const sel = (v, alvo) => (v === alvo ? ' selected' : '');

  let senha = '';
  try { senha = sessionStorage.getItem(CHAVE) || ''; } catch { /* sem sessão: pede a senha */ }
  let dados = null;
  let diaAberto = null;
  let cal = null;

  async function api(metodo, corpo, mes) {
    const r = await fetch(`/api/admin${mes ? `?mes=${mes}` : ''}`, {
      method: metodo,
      headers: { Authorization: `Bearer ${encodeURIComponent(senha)}`, ...(corpo ? { 'Content-Type': 'application/json' } : {}) },
      body: corpo ? JSON.stringify(corpo) : undefined,
    }).catch(() => null);
    if (!r) throw new Error('Sem conexão com o servidor.');
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) { sair(); throw new Error(j.erro || 'Senha incorreta.'); }
    if (!r.ok) throw new Error(j.erro || 'Erro ao falar com o servidor.');
    return j;
  }

  /* ── Entrar e sair ── */
  function sair() {
    senha = '';
    try { sessionStorage.removeItem(CHAVE); } catch { /* ok */ }
    $('#painel').hidden = true;
    $('#sair').hidden = true;
    $('#login').hidden = false;
  }
  $('#sair').addEventListener('click', sair);

  $('#form-login').addEventListener('submit', async (e) => {
    e.preventDefault();
    senha = e.target.elements.senha.value;
    $('#login-msg').textContent = '';
    try { await entrar(); } catch (err) { $('#login').hidden = false; $('#login-msg').textContent = err.message; }
  });

  async function entrar() {
    dados = await api('GET', null, cal?.mes || hojeLocal().slice(0, 7));
    try { sessionStorage.setItem(CHAVE, senha); } catch { /* ok */ }
    $('#login').hidden = true;
    $('#painel').hidden = false;
    $('#sair').hidden = false;
    if (!cal) criaCalendario();
    cal.atualizar();
    configForm();
    tabela();
  }

  async function recarregar() {
    dados = await api('GET', null, cal.mes);
    cal.atualizar();
    tabela();
    const d = diaAberto && dados.dias.find((x) => x.data === diaAberto);
    if (d) editor(d);
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
        let e = d.status === 'reservado' ? ['is-reservado', 'reservado']
          : d.status === 'pendente' ? ['is-pendente', 'aguardando pagamento']
            : d.status === 'livre' ? ['is-disponivel', 'aberto'] : ['is-indisponivel', 'fechado'];
        if (d.feriado || d.ajuste) e = [`${e[0]} tem-excecao`, `${e[1]}${d.feriado ? ', feriado' : ', com ajuste'}`];
        return { classe: e[0], rotulo: e[1], ativo: true };
      },
      aoMes: async () => { try { await recarregar(); } catch (err) { avisoDia(err.message); } },
      aoEscolher: (data) => {
        diaAberto = data;
        const d = dados.dias.find((x) => x.data === data);
        if (d) editor(d);
      },
    });
  }

  const form = $('#adm-dia');
  const avisoDia = (t, ok) => {
    const m = $('.agenda-msg', form), o = $('.adm-ok', form);
    if (m) m.textContent = ok ? '' : t;
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
        <p class="adm-cliente"><b>${esc(r.nome)}</b>${r.whatsapp ? ` · <a href="https://wa.me/55${esc(r.whatsapp)}" target="_blank" rel="noopener">${fone(r.whatsapp)}</a>` : ''}${r.convidados ? ` · ${r.convidados} convidados` : ''}${r.valor ? ` · ${reais(r.valor)}` : ''}<br>Reserva: ${quando(r)}</p>
        ${r.status === 'bloqueio' ? `<div><button type="button" class="btn btn-linha c-azul btn-mini" data-liberar="${esc(r.id)}">Liberar bloqueio</button></div>` : ''}
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
      <label class="campo"><span>Preço só desta data (R$)</span><input type="number" min="0" step="1" inputmode="decimal" name="preco" value="${aj.preco ?? ''}" placeholder="Padrão: ${reais(valorAuto)}"></label>
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

  async function acaoDia(corpo, ok) {
    try {
      await api('POST', corpo);
      await recarregar();
      avisoDia(ok, true);
    } catch (err) { avisoDia(err.message); }
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
    } else if (b.dataset.liberar) acaoDia({ acao: 'cancelar', id: b.dataset.liberar }, 'Bloqueio liberado.');
  });

  /* ── 2. Lista de reservas ── */
  function tabela() {
    const filtro = $('#adm-filtro').value;
    let lista = dados.reservas;
    if (filtro === 'proximas') lista = lista.filter((r) => r.fim >= dados.hoje && ['paga', 'pendente', 'bloqueio', 'conflito'].includes(r.situacao));
    else if (filtro !== 'todas') lista = lista.filter((r) => r.situacao === filtro);
    const caixa = $('#adm-reservas');
    if (!lista.length) { caixa.innerHTML = '<p class="adm-vazio">Nenhuma reserva aqui.</p>'; return; }
    caixa.innerHTML = `<table class="adm-tabela">
      <thead><tr><th scope="col">Data</th><th scope="col">Cliente</th><th scope="col">WhatsApp</th><th scope="col">Conv.</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${lista.map((r) => {
        const pode = ['paga', 'pendente', 'conflito', 'bloqueio'].includes(r.situacao);
        return `<tr>
          <td><b>${quando(r)}</b><br><small>${SEMANA[diaSemana(r.inicio)]}${r.inicio !== r.fim ? ` a ${SEMANA[diaSemana(r.fim)].toLowerCase()}` : ''}</small></td>
          <td>${esc(r.nome)}${r.obs ? `<br><small>${esc(r.obs)}</small>` : ''}</td>
          <td>${r.whatsapp ? `<a href="https://wa.me/55${esc(r.whatsapp)}" target="_blank" rel="noopener">${fone(r.whatsapp)}</a>` : '-'}</td>
          <td>${r.convidados ?? '-'}</td>
          <td>${r.valor ? reais(r.valor_pago ?? r.valor) : '-'}${r.detalhe ? `<br><small>${esc(r.detalhe)}</small>` : ''}</td>
          <td><span class="selo is-${esc(r.situacao)}">${SITUACAO[r.situacao] || esc(r.situacao)}</span></td>
          <td>${pode ? `<button type="button" class="btn btn-linha c-azul btn-mini" data-cancelar="${esc(r.id)}">${r.situacao === 'bloqueio' ? 'Liberar' : 'Cancelar'}</button>` : ''}</td>
        </tr>`;
      }).join('')}</tbody></table>`;
  }
  $('#adm-filtro').addEventListener('change', tabela);

  // Cancelar pede um segundo clique para confirmar
  $('#adm-reservas').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-cancelar]');
    if (!b) return;
    if (!b.dataset.certeza) {
      b.dataset.certeza = '1';
      const antes = b.textContent;
      b.textContent = 'Confirmar?';
      setTimeout(() => { if (b.isConnected) { delete b.dataset.certeza; b.textContent = antes; } }, 4000);
      return;
    }
    b.disabled = true;
    try { await api('POST', { acao: 'cancelar', id: b.dataset.cancelar }); await recarregar(); }
    catch (err) { b.disabled = false; b.textContent = err.message; }
  });

  /* ── 3. Preços e regras ── */
  const cfgForm = $('#adm-config');
  const CAMPOS = ['precoDiaria', 'precoFeriado', 'precoPacote', 'antecedenciaDias', 'mesesAFrente', 'maxConvidados', 'maxDias'];

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
    const config = Object.fromEntries(CAMPOS.map((k) => [k, Number(cfgForm.elements[k].value || 0)]));
    config.semana = SEMANA.map((_, i) => cfgForm.elements[`semana-${i}`].checked);
    try {
      await api('POST', { acao: 'config', config });
      await recarregar();
      configForm();
      $('#cfg-ok').textContent = 'Padrões salvos.';
    } catch (err) { $('#cfg-msg').textContent = err.message; }
  });

  if (senha) entrar().catch(() => sair());
})();
