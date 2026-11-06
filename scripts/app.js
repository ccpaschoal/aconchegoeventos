/* Aconchego Festas e Eventos · telas que trocam na vertical e carrosséis na horizontal ("garrafas").
   Sem JavaScript o site continua funcionando: as telas ficam empilhadas com rolagem normal. */
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Medidas da transição: a tela atual no meio, as vizinhas menores espiando */
  const TELA = { escala: [1, .82, .68], opac: [1, .55, 0], brilho: [1, .7, .5], folga: 22 };
  const CARROSSEL = { dist: [0, .56, .98, 1.3], escala: [1, .74, .56, .44], opac: [1, .92, .6, 0], brilho: [1, .72, .58, .5] };
  const renders = [];
  const { pad: pad2, seta: svgSeta, SETA } = window.Aconchego;

  /* ── Títulos letra por letra ──
     O texto inteiro fica num span invisível para leitores de tela; as letras animadas ficam escondidas deles. */
  document.querySelectorAll('.split').forEach((el) => {
    let c = 0;
    const leitor = document.createElement('span');
    leitor.className = 'sr-only';
    leitor.textContent = el.textContent.replace(/\s+/g, ' ').trim();
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === Node.TEXT_NODE) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(' '); return; }
            const w = document.createElement('span');
            w.className = 'palavra-t';
            [...part].forEach((ch) => {
              const s = document.createElement('span');
              s.className = 'ch';
              s.textContent = ch;
              s.style.setProperty('--c', c++);
              w.append(s);
            });
            frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === Node.ELEMENT_NODE) {
          n.setAttribute('aria-hidden', 'true');
          walk(n);
        }
      });
    };
    walk(el);
    el.querySelectorAll(':scope > .palavra-t').forEach((w) => w.setAttribute('aria-hidden', 'true'));
    el.prepend(leitor);
    el.classList.add('is-split');
  });

  /* ── Carrossel horizontal ── */
  const seta = (dir) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'cf-btn';
    b.setAttribute('aria-label', dir < 0 ? 'Anterior' : 'Próximo');
    b.innerHTML = svgSeta(dir < 0 ? SETA.anterior : SETA.proxima);
    return b;
  };

  document.querySelectorAll('.cf').forEach((cf) => {
    const rail = cf.querySelector('.cf-rail');
    const items = [...rail.querySelectorAll('.cf-item')];
    if (!items.length) return;
    cf.setAttribute('role', 'region');
    cf.setAttribute('aria-roledescription', 'carrossel');

    if (cf.dataset.fundo) {
      const f = document.createElement('span');
      f.className = 'cf-fundo';
      f.setAttribute('aria-hidden', 'true');
      f.textContent = cf.dataset.fundo;
      cf.prepend(f);
    }
    const rod = document.createElement('div');
    rod.className = 'cf-rodape';
    const prev = seta(-1), next = seta(1);
    const conta = document.createElement('span');
    conta.className = 'cf-conta';
    conta.setAttribute('aria-live', 'polite');
    const barra = document.createElement('span');
    barra.className = 'cf-barra';
    barra.setAttribute('aria-hidden', 'true');
    barra.append(document.createElement('span'));
    rod.append(prev, conta, barra, next);
    cf.append(rod);

    items.forEach((item, i) => {
      item.setAttribute('role', 'group');
      item.setAttribute('aria-roledescription', 'slide');
      item.setAttribute('aria-label', `${i + 1} de ${items.length}`);
    });

    let atual = Math.min(items.length - 1, Number(cf.dataset.inicio ?? Math.floor((items.length - 1) / 2)));
    let arrastou = false;

    const render = () => {
      const size = items[0].offsetWidth;
      rail.style.height = `${Math.max(...items.map((i) => i.offsetHeight)) + 16}px`;
      items.forEach((item, i) => {
        const d = i - atual, ad = Math.min(Math.abs(d), 3);
        const x = Math.sign(d) * CARROSSEL.dist[ad] * size;
        item.style.transform = `translateX(${x.toFixed(1)}px) scale(${CARROSSEL.escala[ad]})`;
        item.style.opacity = CARROSSEL.opac[ad];
        item.style.filter = ad ? `brightness(${CARROSSEL.brilho[ad]})` : 'none';
        item.style.zIndex = 10 - ad;
        item.style.visibility = Math.abs(d) > 3 ? 'hidden' : 'visible';
      });
      conta.textContent = `${pad2(atual + 1)} / ${pad2(items.length)}`;
      barra.style.setProperty('--cf-p', `${((atual + 1) / items.length) * 100}%`);
      prev.disabled = atual === 0;
      next.disabled = atual === items.length - 1;
    };
    const go = (i) => { atual = Math.max(0, Math.min(items.length - 1, i)); render(); };

    prev.addEventListener('click', () => go(atual - 1));
    next.addEventListener('click', () => go(atual + 1));
    items.forEach((item, i) => item.addEventListener('click', (e) => {
      if (arrastou || i !== atual) e.preventDefault();
      if (!arrastou && i !== atual) go(i);
    }));
    cf.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowLeft') { e.preventDefault(); go(atual - 1); }
      if (e.key === 'ArrowRight') { e.preventDefault(); go(atual + 1); }
    });

    // Arrastar com mouse ou dedo
    let x0 = null, y0 = null;
    rail.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      x0 = e.clientX; y0 = e.clientY; arrastou = false;
    });
    rail.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - y0)) { arrastou = true; rail.classList.add('is-arrastando'); }
      if (arrastou && Math.abs(dx) > items[0].offsetWidth * .4) { go(atual + (dx < 0 ? 1 : -1)); x0 = e.clientX; }
    });
    const solta = () => {
      x0 = null;
      rail.classList.remove('is-arrastando');
      setTimeout(() => { arrastou = false; }, 0);
    };
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((ev) => rail.addEventListener(ev, solta));

    renders.push(render);
    render();
  });

  /* ── Telas na vertical ── */
  const telas = [...document.querySelectorAll('.screen')];
  const topo = document.querySelector('.topo');
  const contador = document.getElementById('contador');
  if (!telas.length || !topo) return;
  const DUR = reduz ? 0 : 850;
  let atual = -1, travado = false;
  root.classList.add('deck-on');

  const navAltura = () => root.style.setProperty('--nav', `${topo.offsetHeight}px`);

  const render = () => {
    const vh = window.innerHeight;
    const folga = window.innerWidth <= 600 ? Math.round(TELA.folga * .6) : TELA.folga;
    const hAtual = telas[atual].offsetHeight;
    telas.forEach((t, i) => {
      const d = i - atual, ad = Math.min(Math.abs(d), 2);
      let y = 0;
      if (ad === 1) y = Math.sign(d) * (hAtual / 2 + folga + (t.offsetHeight * TELA.escala[1]) / 2);
      else if (ad === 2) y = Math.sign(d) * vh;
      t.style.transform = `translate(-50%, -50%) translateY(${y.toFixed(1)}px) scale(${TELA.escala[ad]})`;
      t.style.opacity = TELA.opac[ad];
      t.style.filter = ad ? `brightness(${TELA.brilho[ad]})` : 'none';
      t.style.zIndex = 10 - ad;
      t.style.visibility = Math.abs(d) > 2 ? 'hidden' : 'visible';
      t.classList.toggle('is-current', d === 0);
      t.classList.toggle('is-near', ad === 1);
    });
    const id = telas[atual].id;
    document.querySelectorAll('.nav a.link').forEach((l) => {
      const ativo = !!id && l.getAttribute('href') === `#${id}`;
      l.classList.toggle('is-ativo', ativo);
      if (ativo) l.setAttribute('aria-current', 'true'); else l.removeAttribute('aria-current');
    });
    topo.style.setProperty('--progresso', (atual / (telas.length - 1)).toFixed(4));
    if (contador) contador.textContent = `${pad2(atual + 1)} / ${pad2(telas.length)}`;
  };

  const go = (i, { deFoco = false } = {}) => {
    const alvo = Math.max(0, Math.min(telas.length - 1, i));
    if (alvo === atual) return;
    atual = alvo;
    travado = true;
    render();
    if (!deFoco) telas[atual].scrollTop = 0;
    setTimeout(() => { travado = false; }, DUR);
  };

  // A tela vizinha que espia também é clicável
  telas.forEach((t, i) => t.addEventListener('click', (e) => {
    if (i === atual) return;
    e.preventDefault();
    e.stopPropagation();
    go(i);
  }, true));

  // Navegando com Tab: ao focar algo de outra tela, ela vem para o meio
  document.addEventListener('focusin', (e) => {
    const i = telas.findIndex((t) => t.contains(e.target));
    if (i >= 0 && i !== atual) {
      go(i, { deFoco: true });
      e.target.scrollIntoView?.({ block: 'nearest' });
    }
  });

  // Se a tela atual tiver mais conteúdo que a altura (celular), rola dentro dela antes de trocar
  const podeRolar = (dir) => {
    const el = telas[atual];
    if (el.scrollHeight <= el.clientHeight + 2) return false;
    return dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2;
  };

  let soma = 0, timer;
  window.addEventListener('wheel', (e) => {
    if (e.ctrlKey || e.metaKey) return; // zoom do navegador
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dir = Math.sign(e.deltaY);
    if (podeRolar(dir) && telas[atual].contains(e.target)) return;
    e.preventDefault();
    if (travado) return;
    soma += e.deltaY;
    clearTimeout(timer);
    timer = setTimeout(() => { soma = 0; }, 200);
    if (Math.abs(soma) > 40) { soma = 0; go(atual + dir); }
  }, { passive: false });

  let toque = null;
  window.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    toque = { x: e.touches[0].clientX, y: e.touches[0].clientY, desce: !podeRolar(1), sobe: !podeRolar(-1) };
  }, { passive: true });
  window.addEventListener('touchend', (e) => {
    if (!toque || travado) { toque = null; return; }
    const dx = e.changedTouches[0].clientX - toque.x, dy = e.changedTouches[0].clientY - toque.y;
    if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx) * 1.2) {
      if (dy < 0 && toque.desce) go(atual + 1);
      if (dy > 0 && toque.sobe) go(atual - 1);
    }
    toque = null;
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.altKey || e.metaKey) return; // atalhos do navegador
    if (travado || e.target.closest('input, textarea, select, [contenteditable]')) return;
    // Espaço em link ou botão é para clicar, não para trocar de tela
    if (e.key === ' ' && e.target.closest('a, button')) return;
    if (e.key === 'Home') { e.preventDefault(); go(0); return; }
    if (e.key === 'End') { e.preventDefault(); go(telas.length - 1); return; }
    const prox = ['ArrowDown', 'PageDown', ' '].includes(e.key);
    const ant = ['ArrowUp', 'PageUp'].includes(e.key);
    if (!prox && !ant) return;
    const dir = prox ? 1 : -1;
    if (podeRolar(dir)) return;
    e.preventDefault();
    go(atual + dir);
  });

  // Links internos (#secao) levam à tela certa
  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const alvo = document.getElementById(a.getAttribute('href').slice(1));
    // "Pular para o conteúdo" aponta para o <main>: leva o foco para a tela que está na frente
    if (alvo && !alvo.closest('.screen') && alvo.contains(telas[atual])) {
      e.preventDefault();
      telas[atual].setAttribute('tabindex', '-1');
      telas[atual].focus({ preventScroll: true });
      return;
    }
    const i = alvo ? telas.indexOf(alvo.closest('.screen')) : -1;
    if (i < 0) return;
    e.preventDefault();
    go(i);
  }));

  const atualizaTudo = () => { navAltura(); render(); renders.forEach((r) => r()); };
  let raf = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(atualizaTudo); });
  window.addEventListener('load', atualizaTudo);
  navAltura();
  go(0);
})();
