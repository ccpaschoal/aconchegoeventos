/* Aconchego · painel da dona (admin.html).
   A senha só fica na sessão deste navegador e é conferida pela function /api/admin. */
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
    const msg = $('#login-msg');
    senha = e.target.elements.senha.value;
    msg.textContent = '';
    try { await entrar(); } catch (err) { $('#login').hidden = false; msg.textContent = err.message; }
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
    if (diaAberto) {
      const d = dados.dias.find((x) => x.data === diaAberto);
      if (d) editor(d);
    }
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
        const st = d.periodos.map((p) => p.status);
        let e = st.includes('reservado') ? ['is-reservado', 'tem reserva']
          : st.includes('pendente') ? ['is-pendente', 'aguardando pagamento']
            : st.includes('livre') ? ['is-disponivel', 'aberto'] : ['is-indisponivel', 'fechado'];
        if (d.excecao) e = [`${e[0]} tem-excecao`, `${e[1]}, com ajuste`];
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
    const m = $('.agenda-msg', form);
    const o = $('.adm-ok', form);
    if (m) m.textContent = ok ? '' : t;
    if (o) o.textContent = ok ? t : '';
  };

  function periodoHtml(p) {
    const r = p.reserva;
    const padrao = dados.config.periodos.find((x) => x.id === p.id)?.preco ?? 0;
    const selo = r ? [r.situacao, SITUACAO[r.situacao] || r.situacao] : p.status === 'livre' ? ['livre', 'Livre'] : ['', 'Fechado'];
    const cliente = r ? `<p class="adm-cliente">${esc(r.nome)}${r.whatsapp ? ` · <a href="https://wa.me/55${esc(r.whatsapp)}" target="_blank" rel="noopener">${fone(r.whatsapp)}</a>` : ''}${r.convidados ? ` · ${r.convidados} convidados` : ''}${r.valor ? ` · ${reais(r.valor)}` : ''}</p>
      ${r.situacao === 'bloqueio' ? `<div><button type="button" class="btn btn-linha c-azul btn-mini" data-liberar="${esc(r.id)}">Liberar bloqueio</button></div>` : ''}` : '';
    const bloqueio = r ? '' : `
      <div><button type="button" class="btn btn-linha c-azul btn-mini" data-abrir-bloq="${esc(p.id)}" aria-expanded="false" aria-controls="bloq-${esc(p.id)}">Bloquear (fechado pelo WhatsApp)</button></div>
      <div class="adm-bloq" id="bloq-${esc(p.id)}" hidden>
        <label class="campo"><span>Nome do cliente</span><input name="bnome-${esc(p.id)}" maxlength="80"></label>
        <label class="campo"><span>WhatsApp (opcional)</span><input name="bwhats-${esc(p.id)}" type="tel" inputmode="tel"></label>
        <label class="campo"><span>Valor combinado (opcional)</span><input name="bvalor-${esc(p.id)}" type="number" min="0" step="1" inputmode="decimal"></label>
        <div><button type="button" class="btn btn-azul btn-mini" data-bloquear="${esc(p.id)}">Confirmar bloqueio</button></div>
      </div>`;
    return `<div class="adm-periodo">
      <div class="adm-periodo-topo"><b>${esc(p.nome)}</b><small>${esc(p.horario)}</small><span class="selo is-${selo[0]}">${esc(selo[1])}</span></div>
      ${cliente}
      <label class="chk"><input type="checkbox" name="aberto-${esc(p.id)}"${p.fechado ? '' : ' checked'}> Aberto para reserva neste dia</label>
      <label class="campo"><span>Preço nesta data (R$)</span><input type="number" min="0" step="1" inputmode="decimal" name="preco-${esc(p.id)}" value="${p.precoExcecao ?? ''}" placeholder="Padrão: ${reais(padrao)}"></label>
      ${bloqueio}
    </div>`;
  }

  function editor(d) {
    const exc = d.excecao || {};
    const padraoAberto = dados.config.semana[diaSemana(d.data)];
    const fechadoAgora = d.motivo === 'fechado';
    form.innerHTML = `
      <p class="agenda-passo">${esc(dataLonga(d.data))}</p>
      ${MOTIVO[d.motivo] ? `<p class="nota">${MOTIVO[d.motivo]}</p>` : ''}
      <div class="acoes"><button type="button" class="btn ${fechadoAgora ? 'btn-azul' : 'btn-linha c-azul'} btn-mini" data-rapido="${fechadoAgora ? 1 : 0}">${fechadoAgora ? 'Abrir este dia' : 'Fechar este dia'}</button></div>
      <label class="campo"><span>Este dia</span><select name="aberto">
        <option value="">Igual ao padrão de ${SEMANA[diaSemana(d.data)].toLowerCase()} (${padraoAberto ? 'aberto' : 'fechado'})</option>
        <option value="1"${exc.aberto === true ? ' selected' : ''}>Aberto</option>
        <option value="0"${exc.aberto === false ? ' selected' : ''}>Fechado</option>
      </select></label>
      ${d.periodos.map(periodoHtml).join('')}
      <p class="agenda-msg" role="alert"></p>
      <p class="adm-ok" role="status"></p>
      <div class="acoes"><button class="btn btn-azul" type="submit">Salvar este dia</button></div>`;
  }

  const lerDia = (abertoForcado) => {
    const v = form.elements.aberto.value;
    const periodos = {};
    dados.config.periodos.forEach((p) => {
      periodos[p.id] = { fechado: !form.elements[`aberto-${p.id}`]?.checked, preco: form.elements[`preco-${p.id}`]?.value ?? '' };
    });
    const aberto = abertoForcado !== undefined ? abertoForcado : v === '1' ? true : v === '0' ? false : null;
    return { acao: 'dia', data: diaAberto, aberto, periodos };
  };

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
    else if (b.dataset.abrirBloq) {
      const caixa = $(`#bloq-${b.dataset.abrirBloq}`, form);
      caixa.hidden = !caixa.hidden;
      b.setAttribute('aria-expanded', String(!caixa.hidden));
      if (!caixa.hidden) $('input', caixa).focus();
    } else if (b.dataset.bloquear) {
      const id = b.dataset.bloquear;
      acaoDia({
        acao: 'bloquear', data: diaAberto, periodo: id,
        nome: form.elements[`bnome-${id}`].value, whatsapp: form.elements[`bwhats-${id}`].value, valor: form.elements[`bvalor-${id}`].value,
      }, 'Data bloqueada.');
    } else if (b.dataset.liberar) acaoDia({ acao: 'cancelar', id: b.dataset.liberar }, 'Bloqueio liberado.');
  });

  /* ── 2. Lista de reservas ── */
  function tabela() {
    const filtro = $('#adm-filtro').value;
    let lista = dados.reservas;
    if (filtro === 'proximas') lista = lista.filter((r) => r.data >= dados.hoje && ['paga', 'pendente', 'bloqueio', 'conflito'].includes(r.situacao));
    else if (filtro !== 'todas') lista = lista.filter((r) => r.situacao === filtro);
    const caixa = $('#adm-reservas');
    if (!lista.length) { caixa.innerHTML = '<p class="adm-vazio">Nenhuma reserva aqui.</p>'; return; }
    caixa.innerHTML = `<table class="adm-tabela">
      <thead><tr><th scope="col">Data</th><th scope="col">Período</th><th scope="col">Cliente</th><th scope="col">WhatsApp</th><th scope="col">Conv.</th><th scope="col">Valor</th><th scope="col">Situação</th><th scope="col"><span class="sr-only">Ações</span></th></tr></thead>
      <tbody>${lista.map((r) => {
        const pode = ['paga', 'pendente', 'conflito', 'bloqueio'].includes(r.situacao);
        return `<tr>
          <td><b>${dataCurta(r.data)}</b><br><small>${SEMANA[diaSemana(r.data)]}</small></td>
          <td>${esc(r.periodoNome || r.periodo)}<br><small>${esc(r.horario || '')}</small></td>
          <td>${esc(r.nome)}${r.obs ? `<br><small>${esc(r.obs)}</small>` : ''}</td>
          <td>${r.whatsapp ? `<a href="https://wa.me/55${esc(r.whatsapp)}" target="_blank" rel="noopener">${fone(r.whatsapp)}</a>` : '-'}</td>
          <td>${r.convidados ?? '-'}</td>
          <td>${r.valor ? reais(r.valorPago ?? r.valor) : '-'}</td>
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

  /* ── 3. Períodos, preços e dias da semana ── */
  const cfgForm = $('#adm-config');
  const linhaPeriodo = (p = {}) => `<div class="adm-periodo-cfg" data-id="${esc(p.id || '')}">
    <label class="campo"><span>Nome</span><input name="nome" value="${esc(p.nome || '')}" maxlength="30" required></label>
    <label class="campo"><span>Horário</span><input name="horario" value="${esc(p.horario || '')}" maxlength="30" placeholder="19h às 2h"></label>
    <label class="campo"><span>Preço padrão (R$)</span><input name="preco" type="number" min="0" step="1" inputmode="decimal" value="${p.preco ?? 0}"></label>
    <label class="chk"><input type="checkbox" name="diaInteiro"${p.diaInteiro ? ' checked' : ''}> Ocupa o dia todo</label>
    <button type="button" class="btn btn-linha c-azul btn-mini" data-remover>Remover</button>
  </div>`;

  function configForm() {
    const c = dados.config;
    $('#cfg-periodos').innerHTML = c.periodos.map(linhaPeriodo).join('');
    const semana = $('#cfg-semana');
    semana.querySelectorAll('.chk').forEach((el) => el.remove());
    SEMANA.forEach((s, i) => semana.insertAdjacentHTML('beforeend',
      `<label class="chk"><input type="checkbox" name="semana-${i}"${c.semana[i] ? ' checked' : ''}> ${s}</label>`));
    ['antecedenciaDias', 'mesesAFrente', 'maxConvidados'].forEach((k) => { cfgForm.elements[k].value = c[k]; });
  }

  $('#cfg-add').addEventListener('click', () => {
    $('#cfg-periodos').insertAdjacentHTML('beforeend', linhaPeriodo());
    $('#cfg-periodos .adm-periodo-cfg:last-child input').focus();
  });
  $('#cfg-periodos').addEventListener('click', (e) => {
    if (e.target.closest('[data-remover]')) e.target.closest('.adm-periodo-cfg').remove();
  });

  cfgForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    $('#cfg-msg').textContent = '';
    $('#cfg-ok').textContent = '';
    const config = {
      periodos: [...cfgForm.querySelectorAll('.adm-periodo-cfg')].map((l) => ({
        id: l.dataset.id || undefined,
        nome: $('[name="nome"]', l).value,
        horario: $('[name="horario"]', l).value,
        preco: Number($('[name="preco"]', l).value || 0),
        diaInteiro: $('[name="diaInteiro"]', l).checked,
      })),
      semana: SEMANA.map((_, i) => cfgForm.elements[`semana-${i}`].checked),
      antecedenciaDias: cfgForm.elements.antecedenciaDias.value,
      mesesAFrente: cfgForm.elements.mesesAFrente.value,
      maxConvidados: cfgForm.elements.maxConvidados.value,
    };
    try {
      await api('POST', { acao: 'config', config });
      await recarregar();
      configForm();
      $('#cfg-ok').textContent = 'Padrões salvos.';
    } catch (err) { $('#cfg-msg').textContent = err.message; }
  });

  if (senha) entrar().catch(() => sair());
})();
