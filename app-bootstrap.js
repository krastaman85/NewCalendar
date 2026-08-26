(() => {
  let appLoading = false;

  function loadApp() {
    if (appLoading) return;
    appLoading = true;

    const script = document.createElement('script');
    script.src = './app.js';
    script.defer = true;
    script.onload = () => {
      const eventLoader = document.createElement('script');
      eventLoader.src = './app-events.js';
      eventLoader.defer = true;
      eventLoader.onload = () => {
        const pdfLoader = document.createElement('script');
        pdfLoader.src = './app-pdf.js';
        pdfLoader.defer = true;
        pdfLoader.onload = () => {
          document.body.dataset.appLoaded = 'true';
        };
        pdfLoader.onerror = () => {
          document.body.dataset.appLoaded = 'true';
        };
        document.head.appendChild(pdfLoader);
      };
      eventLoader.onerror = () => {
        const pdfLoader = document.createElement('script');
        pdfLoader.src = './app-pdf.js';
        pdfLoader.defer = true;
        pdfLoader.onload = () => {
          document.body.dataset.appLoaded = 'true';
        };
        pdfLoader.onerror = () => {
          document.body.dataset.appLoaded = 'true';
        };
        document.head.appendChild(pdfLoader);
      };
      document.head.appendChild(eventLoader);
    };
    script.onerror = () => {
      const fallback = document.createElement('div');
      fallback.textContent = 'Impossibile caricare l’applicazione. Ricarica la pagina.';
      fallback.style.cssText = 'padding: 24px; color: #e5e7eb; font-family: sans-serif; text-align: center;';
      document.body.prepend(fallback);
    };
    document.head.appendChild(script);
  }

  function scheduleLoad() {
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(() => loadApp(), { timeout: 1000 });
    } else {
      setTimeout(loadApp, 350);
    }
  }

  const onFirstInteraction = () => {
    loadApp();
    document.removeEventListener('pointerdown', onFirstInteraction, { capture: true });
    document.removeEventListener('keydown', onFirstInteraction, { capture: true });
  };

  document.addEventListener('pointerdown', onFirstInteraction, { capture: true, once: true });
  document.addEventListener('keydown', onFirstInteraction, { capture: true, once: true });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', scheduleLoad, { once: true });
  } else {
    scheduleLoad();
  }
})();
