/* Aconchego Festas e Eventos · transição de garrafas (telas na vertical e carrosséis na horizontal) */
(() => {
  const root = document.documentElement;
  root.classList.add('js');
  const reduz = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* As três versões da transição de garrafa */
  const AMOSTRAS = {
    a: { tela: { escala: [1, .82, .68], opac: [1, .55, 0], brilho: [1, .7, .5], folga: 22, giro: 0 },
         cf:   { dist: [0, .56, .98, 1.3], escala: [1, .74, .56, .44], opac: [1, .92, .6, 0], brilho: [1, .72, .58, .5], giro: 0 } },
    b: { tela: { escala: [1, .9, .8], opac: [1, .95, 0], brilho: [1, .85, .6], folga: -46, giro: 0 },
         cf:   { dist: [0, .4, .68, .9], escala: [1, .84, .7, .56], opac: [1, 1, .85, 0], brilho: [1, .86, .72, .6], giro: 0 } },
    c: { tela: { escala: [1, .78, .62], opac: [1, .5, 0], brilho: [1, .66, .45], folga: 14, giro: 18 },
         cf:   { dist: [0, .6, 1.02, 1.34], escala: [1, .78, .6, .46], opac: [1, .9, .55, 0], brilho: [1, .7, .55, .45], giro: 38 } },
  };
  // Qual transição usar: 'a' (clássica), 'b' (empilhada) ou 'c' (inclinada)
  const amostra = 'a';
  const renders = [];

  /* Títulos letra por letra, sem perder as cores e sublinhados */
  document.querySelectorAll('.split').forEach((el) => {
    let c = 0;
    const walk = (node) => {
      [...node.childNodes].forEach((n) => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach((part) => {
            if (!part) return;
            if (/^\s+$/.test(part)) { frag.append(document.createTextNode(' ')); return; }
            const w = document.createElement('span');
            w.className = 'palavra-t';
            [...part].forEach((ch) => {
              const s = document.createElement('span');
              s.className = 'ch'; s.textContent = ch; s.style.setProperty('--c', c++);
              w.append(s);
            });
            frag.append(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1) walk(n);
      });
    };
    el.setAttribute('aria-label', el.textContent.trim());
    walk(el);
    el.classList.add('is-split');
  });

  /* Carrossel garrafas na horizontal */
  const seta = (dir) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'cf-btn';
    b.setAttribute('aria-label', dir < 0 ? 'Anterior' : 'Próximo');
    b.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="${dir < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}"/></svg>`;
    return b;
  };
  document.querySelectorAll('.cf').forEach((cf) => {
    const rail = cf.querySelector('.cf-rail');
    const items = [...rail.querySelectorAll('.cf-item')];
    if (cf.dataset.fundo) {
      const f = document.createElement('span');
      f.className = 'cf-fundo'; f.setAttribute('aria-hidden', 'true'); f.textContent = cf.dataset.fundo;
      cf.prepend(f);
    }
    const rod = document.createElement('div');
    rod.className = 'cf-rodape';
    const prev = seta(-1), next = seta(1);
    const conta = document.createElement('span'); conta.className = 'cf-conta';
    const barra = document.createElement('span'); barra.className = 'cf-barra'; barra.innerHTML = '<span></span>';
    rod.append(prev, conta, barra, next);
    cf.append(rod);
    let atual = Math.min(items.length - 1, Number(cf.dataset.inicio || Math.floor((items.length - 1) / 2)));
    let arrastou = false;

    const render = () => {
      const p = AMOSTRAS[amostra].cf;
      const size = items[0].offsetWidth;
      const alto = Math.max(...items.map((i) => i.offsetHeight));
      rail.style.height = `${alto + 16}px`;
      items.forEach((item, i) => {
        const d = i - atual, ad = Math.min(Math.abs(d), 3);
        const x = Math.sign(d) * p.dist[ad] * size;
        const ry = -Math.sign(d) * p.giro;
        item.style.transform = `translateX(${x.toFixed(1)}px) perspective(1100px) rotateY(${ry}deg) scale(${p.escala[ad]})`;
        item.style.opacity = p.opac[ad];
        item.style.filter = ad ? `brightness(${p.brilho[ad]})` : 'none';
        item.style.zIndex = 10 - ad;
        item.style.visibility = Math.abs(d) > 3 ? 'hidden' : 'visible';
        item.setAttribute('aria-hidden', String(d !== 0));
        if (item.matches('a')) item.tabIndex = d === 0 ? 0 : -1;
      });
      conta.textContent = `${String(atual + 1).padStart(2, '0')} / ${String(items.length).padStart(2, '0')}`;
      barra.style.setProperty('--cf-p', `${((atual + 1) / items.length) * 100}%`);
      prev.disabled = atual === 0; next.disabled = atual === items.length - 1;
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
    let x0 = null, y0 = null;
    rail.addEventListener('pointerdown', (e) => { if (e.button !== 0) return; x0 = e.clientX; y0 = e.clientY; arrastou = false; });
    rail.addEventListener('pointermove', (e) => {
      if (x0 === null) return;
      const dx = e.clientX - x0;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(e.clientY - y0)) { arrastou = true; rail.classList.add('is-arrastando'); }
      if (arrastou && Math.abs(dx) > items[0].offsetWidth * .4) { go(atual + (dx < 0 ? 1 : -1)); x0 = e.clientX; }
    });
    const solta = () => { x0 = null; rail.classList.remove('is-arrastando'); setTimeout(() => { arrastou = false; }, 0); };
    rail.addEventListener('pointerup', solta);
    rail.addEventListener('pointercancel', solta);
    rail.addEventListener('pointerleave', solta);
    renders.push(render);
    render();
  });

  /* Telas que trocam como garrafas na vertical */
  const telas = [...document.querySelectorAll('.screen')];
  const topo = document.querySelector('.topo');
  const contador = document.getElementById('contador');
  const DUR = reduz ? 0 : 850;
  let atual = 0, travado = false;
  root.classList.add('deck-on');

  const navAltura = () => root.style.setProperty('--nav', `${topo.offsetHeight}px`);

  const render = () => {
    const p = AMOSTRAS[amostra].tela;
    const vh = window.innerHeight;
    const folga = window.innerWidth <= 600 ? Math.round(p.folga * .6) : p.folga;
    const hAtual = telas[atual].offsetHeight;
    telas.forEach((t, i) => {
      const d = i - atual, ad = Math.min(Math.abs(d), 2);
      let y = 0;
      if (ad === 1) y = Math.sign(d) * (hAtual / 2 + folga + (t.offsetHeight * p.escala[1]) / 2);
      else if (ad === 2) y = Math.sign(d) * vh;
      const rx = -Math.sign(d) * p.giro;
      t.style.transform = `translate(-50%, -50%) perspective(1600px) translateY(${y.toFixed(1)}px) rotateX(${rx}deg) scale(${p.escala[ad]})`;
      t.style.opacity = p.opac[ad];
      t.style.filter = ad ? `brightness(${p.brilho[ad]})` : 'none';
      t.style.zIndex = 10 - ad;
      t.style.visibility = Math.abs(d) > 2 ? 'hidden' : 'visible';
      t.classList.toggle('is-current', d === 0);
      t.classList.toggle('is-near', ad === 1);
      t.inert = ad > 1;
      t.setAttribute('aria-hidden', String(d !== 0));
    });
    const id = telas[atual].id;
    document.querySelectorAll('.nav a.link').forEach((l) => l.classList.toggle('is-ativo', !!id && l.getAttribute('href') === `#${id}`));
    topo.style.setProperty('--progresso', (atual / (telas.length - 1)).toFixed(4));
    contador.textContent = `${String(atual + 1).padStart(2, '0')} / ${String(telas.length).padStart(2, '0')}`;
  };

  const go = (i) => {
    const alvo = Math.max(0, Math.min(telas.length - 1, i));
    if (alvo === atual && telas[atual].classList.contains('is-current')) return;
    atual = alvo; travado = true;
    render();
    telas[atual].scrollTop = 0;
    setTimeout(() => { travado = false; }, DUR);
  };

  // A tela vizinha que espia também é clicável
  telas.forEach((t, i) => t.addEventListener('click', (e) => {
    if (i === atual) return;
    e.preventDefault(); e.stopPropagation(); go(i);
  }, true));

  // Se a tela atual tiver conteúdo maior (celular), rola dentro dela antes de trocar
  const podeRolar = (dir) => {
    const el = telas[atual];
    if (el.scrollHeight <= el.clientHeight + 2) return false;
    return dir > 0 ? el.scrollTop + el.clientHeight < el.scrollHeight - 2 : el.scrollTop > 2;
  };

  let soma = 0, timer;
  window.addEventListener('wheel', (e) => {
    if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
    const dir = Math.sign(e.deltaY);
    if (podeRolar(dir) && telas[atual].contains(e.target)) return;
    e.preventDefault();
    if (travado) return;
    soma += e.deltaY;
    clearTimeout(timer); timer = setTimeout(() => { soma = 0; }, 200);
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
    if (travado || e.target.closest('input, textarea, select')) return;
    if (e.key === 'Home') { e.preventDefault(); go(0); return; }
    if (e.key === 'End') { e.preventDefault(); go(telas.length - 1); return; }
    const prox = ['ArrowDown', 'PageDown', ' '].includes(e.key), ant = ['ArrowUp', 'PageUp'].includes(e.key);
    if (!prox && !ant) return;
    const dir = prox ? 1 : -1;
    if (podeRolar(dir)) return;
    e.preventDefault(); go(atual + dir);
  });

  document.querySelectorAll('a[href^="#"]').forEach((a) => a.addEventListener('click', (e) => {
    const alvo = document.getElementById(a.getAttribute('href').slice(1));
    const i = alvo ? telas.indexOf(alvo.closest('.screen')) : -1;
    if (i < 0) return;
    e.preventDefault(); go(i);
  }));

  let f = 0;
  window.addEventListener('resize', () => { cancelAnimationFrame(f); f = requestAnimationFrame(() => { navAltura(); render(); renders.forEach((r) => r()); }); });
  window.addEventListener('load', () => { navAltura(); render(); renders.forEach((r) => r()); });
  navAltura();
  atual = -1; go(0);
})();
