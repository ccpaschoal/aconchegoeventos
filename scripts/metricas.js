/* Aconchego · Rastreamento de métricas (Meta Pixel e Google Analytics 4)
   Coloque os IDs das suas ferramentas abaixo entre as aspas:
   - META_PIXEL_ID: seu ID numérico do Pixel da Meta (ex.: '1234567890123456')
   - GA4_MEASUREMENT_ID: seu ID do Google Analytics 4 (ex.: 'G-XXXXXXXXXX')
*/
(() => {
  const CONFIG = {
    META_PIXEL_ID: '',             // <-- Insira aqui o ID do Meta Pixel
    GA4_MEASUREMENT_ID: 'G-9VVC37MD5M', // Google Analytics 4 (Aconchego)
  };

  // 1. Inicializa o Meta Pixel caso o ID esteja configurado
  if (CONFIG.META_PIXEL_ID && !window.fbq) {
    !function(f,b,e,v,n,t,s)
    {if(f.fbq)return;n=f.fbq=function(){n.callMethod?
    n.callMethod.apply(n,arguments):n.queue.push(arguments)};
    if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
    n.queue=[];t=b.createElement(e);t.async=!0;
    t.src=v;s=b.getElementsByTagName(e)[0];
    s.parentNode.insertBefore(t,s)}(window, document,'script',
    'https://connect.facebook.net/en_US/fbevents.js');
    window.fbq('init', CONFIG.META_PIXEL_ID);
    window.fbq('track', 'PageView');
  }

  // 2. Inicializa o Google Analytics (GA4) caso o ID esteja configurado
  if (CONFIG.GA4_MEASUREMENT_ID && !window.gtag) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(CONFIG.GA4_MEASUREMENT_ID)}`;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    function gtag(){ window.dataLayer.push(arguments); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', CONFIG.GA4_MEASUREMENT_ID);
  }

  // 3. Função universal para disparar eventos de conversão
  function registrarMetrica(evento, dados = {}) {
    // Meta Pixel
    if (typeof window.fbq === 'function') {
      if (evento === 'whatsapp') {
        window.fbq('trackCustom', 'CliqueWhatsApp', dados);
        window.fbq('track', 'Contact');
      } else if (evento === 'iniciar_reserva') {
        window.fbq('track', 'InitiateCheckout', {
          value: dados.valor,
          currency: 'BRL',
          content_name: dados.periodo || 'Reserva Aconchego',
        });
      } else if (evento === 'reserva_paga') {
        window.fbq('track', 'Purchase', {
          value: dados.valor,
          currency: 'BRL',
          content_name: dados.periodo || 'Reserva Aconchego',
        });
      } else {
        window.fbq('trackCustom', evento, dados);
      }
    }

    // Google Analytics 4
    if (typeof window.gtag === 'function') {
      if (evento === 'whatsapp') {
        window.gtag('event', 'generate_lead', {
          event_category: 'contato',
          event_label: dados.origem || 'whatsapp',
          value: dados.valor || 0,
        });
      } else if (evento === 'iniciar_reserva') {
        window.gtag('event', 'begin_checkout', {
          value: dados.valor,
          currency: 'BRL',
          items: [{ item_name: dados.periodo || 'Reserva Aconchego' }],
        });
      } else if (evento === 'reserva_paga') {
        window.gtag('event', 'purchase', {
          transaction_id: dados.id,
          value: dados.valor,
          currency: 'BRL',
          items: [{ item_name: dados.periodo || 'Reserva Aconchego' }],
        });
      } else {
        window.gtag('event', evento, dados);
      }
    }

    // Aviso no console durante o desenvolvimento caso os IDs ainda não tenham sido preenchidos
    if (!CONFIG.META_PIXEL_ID && !CONFIG.GA4_MEASUREMENT_ID) {
      console.debug('[Métricas Aconchego]', evento, dados);
    }
  }

  // 4. Rastreamento automático de cliques em links de WhatsApp
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[href*="wa.me"], a[href*="whatsapp.com"]');
    if (!link) return;
    const origem = link.getAttribute('aria-label') || link.innerText?.trim() || link.className || 'link_whatsapp';
    registrarMetrica('whatsapp', { origem, url: link.href });
  });

  window.AconchegoMetricas = {
    config: CONFIG,
    registrarMetrica,
  };
})();
