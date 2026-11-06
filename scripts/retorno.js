/* Aconchego · páginas de retorno do Mercado Pago (sucesso, pendente, erro).
   Mostra o resumo guardado antes de ir para o pagamento. Sem ele, a página funciona igual.
   Na página de sucesso, confere com a API se o pagamento já confirmou antes de dizer "data reservada". */
(() => {
  const CHAVE = 'aconchego-reserva';
  let r = null;
  try { r = JSON.parse(localStorage.getItem(CHAVE) || 'null'); } catch { /* sem armazenamento */ }
  const q = new URLSearchParams(location.search);
  const ref = q.get('external_reference');
  if (r && ref && r.id && ref !== r.id) r = null; // resumo de outra reserva
  const vencida = r && !(Date.parse(r.expiraEm) > Date.now());

  const caixa = document.getElementById('resumo');
  if (r && caixa) {
    const valor = window.Aconchego.reais(r.valor);
    const linha = (t) => { const p = document.createElement('span'); p.textContent = t; return p; };
    const b = document.createElement('b');
    b.textContent = r.quando;
    caixa.append(b, linha(`${r.periodo}${r.horario ? ` · ${r.horario}` : ''}`), linha(valor));
    const pg = q.get('payment_id');
    if (pg && pg !== 'null' && /^\d{1,20}$/.test(pg)) caixa.append(linha(`Pagamento nº ${pg}`));
    caixa.hidden = false;
  }

  // Só volta para um link do Mercado Pago em https (o resumo vem do armazenamento do navegador)
  const linkSeguro = (url) => {
    try { const u = new URL(url); return u.protocol === 'https:' && /(^|\.)mercadopago\.com(\.br)?$/.test(u.hostname); } catch { return false; }
  };

  const pagina = location.pathname.split('/').pop().replace(/.html$/, '') || 'sucesso';
  // Erro: enquanto a reserva ainda está guardada, "Tentar de novo" volta para o mesmo pagamento
  if (pagina === 'erro' && r?.link && linkSeguro(r.link) && Date.parse(r.expiraEm) > Date.now() + 60e3) {
    const btn = document.querySelector('.acoes .btn');
    if (btn) { btn.href = r.link; btn.textContent = 'Tentar pagar de novo'; }
  }
  // Resumo vencido não serve mais para nada (e o link de pagamento já expirou)
  if (vencida && pagina !== 'sucesso') { try { localStorage.removeItem(CHAVE); } catch { /* ok */ } }

  if (pagina !== 'sucesso') return;
  try { localStorage.removeItem(CHAVE); } catch { /* ok */ }

  const id = ref || r?.id;
  const el = (s) => document.querySelector(s);
  const mostrar = ({ olho, titulo, sub, texto }) => {
    if (el('#ret-olho')) el('#ret-olho').textContent = olho;
    const h1 = el('#titulo');
    if (h1) { h1.textContent = `${titulo} `; const s = document.createElement('span'); s.className = 'sub sub-azul'; s.textContent = sub; h1.append(s); }
    if (el('#ret-texto')) el('#ret-texto').textContent = texto;
  };
  const PAGA = { olho: 'Pagamento aprovado', titulo: 'Sua data está', sub: 'reservada!', texto: 'Obrigado! O pagamento foi aprovado e a data já é sua. A gente vai chamar você no WhatsApp para combinar os detalhes da festa.' };
  const ESPERA = { olho: 'Pagamento recebido', titulo: 'Estamos', sub: 'confirmando', texto: 'O Mercado Pago ainda está confirmando o pagamento. Assim que confirmar, a data é sua e a gente chama você no WhatsApp. Pode fechar esta página.' };
  const CONFLITO = { olho: 'Pagamento recebido', titulo: 'Precisamos', sub: 'falar com você', texto: 'O pagamento chegou, mas houve um problema com a data. A gente vai chamar você no WhatsApp para resolver ou devolver o valor.' };
  if (!id || !/^\d{4}-\d{2}-\d{2}_[a-f0-9]{12}$/.test(id)) { mostrar(ESPERA); return; }

  // O aviso do Mercado Pago pode chegar alguns segundos depois do cliente: tenta algumas vezes
  let tentativas = 0;
  const conferir = async () => {
    tentativas += 1;
    try {
      const { r: resp, j } = await window.Aconchego.buscarJSON(`${window.Aconchego.api()}/status?id=${encodeURIComponent(id)}`, {}, 8000);
      if (resp.ok && ['paga', 'confirmada'].includes(j.status)) return mostrar(PAGA);
      if (resp.ok && j.status === 'conflito') return mostrar(CONFLITO);
    } catch { /* sem conexão: tenta de novo */ }
    if (tentativas < 6) setTimeout(conferir, 3000);
    else mostrar(ESPERA);
  };
  conferir();
})();
