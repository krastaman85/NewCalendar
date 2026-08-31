(() => {
  // La logica principale (app-core.js) è già caricata da index.html.
  // Qui carichiamo solo il gestore eventi e il wrapper PDF. pdf-lib NON viene
  // caricato all'avvio: lo carica app-pdf.js on-demand alla prima generazione.
  let appLoading = false;

  function loadScript(src) {
    return new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = src;
      s.defer = true;
      s.onload = () => resolve(true);
      s.onerror = () => resolve(false);
      document.head.appendChild(s);
    });
  }

  async function loadApp() {
    if (appLoading) return;
    appLoading = true;
    await loadScript('./app-events.js');
    await loadScript('./app-pdf.js');
    document.body.dataset.appLoaded = 'true';
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
