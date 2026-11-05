/* Aconchego · páginas de retorno do Mercado Pago (sucesso, pendente, erro).
   Mostra o resumo guardado antes de ir para o pagamento. Sem ele, a página funciona igual. */
(() => {
  let r = null;
  try { r = JSON.parse(localStorage.getItem('aconchego-reserva') || 'null'); } catch { /* sem armazenamento */ }
  const q = new URLSearchParams(location.search);
  const ref = q.get('external_reference');
  if (r && ref && r.id && ref !== r.id) r = null; // resumo de outra reserva

  const caixa = document.getElementById('resumo');
  if (r && caixa) {
    const valor = Number(r.valor).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const linha = (t) => { const p = document.createElement('span'); p.textContent = t; return p; };
    const b = document.createElement('b');
    b.textContent = r.quando;
    caixa.append(b, linha(`${r.periodo}${r.horario ? ` · ${r.horario}` : ''}`), linha(valor));
    const pg = q.get('payment_id');
    if (pg && pg !== 'null') caixa.append(linha(`Pagamento nº ${pg}`));
    caixa.hidden = false;
  }

  const pagina = location.pathname.split('/').pop().replace(/.html$/, '');
  // Erro: enquanto a reserva ainda está guardada, "Tentar de novo" volta para o mesmo pagamento
  if (pagina === 'erro' && r?.link && Date.parse(r.expiraEm) > Date.now() + 60e3) {
    const btn = document.querySelector('.acoes .btn');
    if (btn) { btn.href = r.link; btn.textContent = 'Tentar pagar de novo'; }
  }
  if (pagina === 'sucesso') { try { localStorage.removeItem('aconchego-reserva'); } catch { /* ok */ } }
})();
