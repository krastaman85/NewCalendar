(() => {
  const pdfNames = ['generateSingleForm', 'generateAllForms', 'fillFormPdf', 'downloadOrSharePdf'];

  function ensurePdfLib() {
    return new Promise((resolve, reject) => {
      if (window.PDFLib) {
        resolve();
        return;
      }

      const existing = document.querySelector('script[data-pdf-lib="true"]');
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true });
        existing.addEventListener('error', () => reject(new Error('Impossibile caricare la libreria PDF.')), { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = './pdf-lib.min.js';
      script.async = true;
      script.dataset.pdfLib = 'true';
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Impossibile caricare la libreria PDF.'));
      document.head.appendChild(script);
    });
  }

  const originals = {};
  pdfNames.forEach((name) => {
    if (typeof window[name] === 'function') {
      originals[name] = window[name];
    }
  });

  if (!window.__pdfLazyPatched) {
    window.__pdfLazyPatched = true;
    window.__pdfOriginals = originals;
    window.loadPdfModule = ensurePdfLib;

    if (typeof originals.generateSingleForm === 'function') {
      window.generateSingleForm = async function (...args) {
        await ensurePdfLib();
        return window.__pdfOriginals.generateSingleForm.apply(window, args);
      };
    }

    if (typeof originals.generateAllForms === 'function') {
      window.generateAllForms = async function (...args) {
        await ensurePdfLib();
        return window.__pdfOriginals.generateAllForms.apply(window, args);
      };
    }

    if (typeof originals.fillFormPdf === 'function') {
      window.fillFormPdf = async function (...args) {
        await ensurePdfLib();
        return window.__pdfOriginals.fillFormPdf.apply(window, args);
      };
    }

    if (typeof originals.downloadOrSharePdf === 'function') {
      window.downloadOrSharePdf = async function (...args) {
        await ensurePdfLib();
        return window.__pdfOriginals.downloadOrSharePdf.apply(window, args);
      };
    }
  }
})();
