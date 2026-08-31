# Calendario Diritti di Visita

App web (PWA) per **segnare i giorni di visita** di ogni figlio e **generare i moduli
mensili ufficiali** "Richiesta prestazione speciale per diritti di visita"
(USSI/URAR, Cantone Ticino) in PDF, già compilati e pronti per firma e data a mano.

Tutti i dati restano **solo sul dispositivo** (localStorage): nessun server, nessuna
condivisione con terzi.

## Funzionalità

- **Calendario per figlio** con colori distinti (verde / turchese, estendibile).
- **Vista combinata**: entrambi i figli sullo stesso calendario.
- **Statistiche (KPI)** su una sola riga, con transizioni fluide quando cambiano.
- **Data di nascita per figlio**: inserita nelle Impostazioni, viene compilata
  automaticamente nel modulo (campo "data di nascita").
- **Generazione PDF** del modulo ufficiale (via `pdf-lib`, caricato solo al bisogno).
- **Backup / ripristino** dei dati in JSON, con validazione anti-manomissione.
- **PWA installabile** e funzionante offline (service worker).
- **Navigazione a gesto** (swipe) per cambiare mese; design animato e responsivo.

## Struttura dei file

| File | Ruolo |
|------|-------|
| `index.html` | Struttura della pagina (markup) |
| `app.css` | Stili, animazioni, responsività |
| `app-core.js` | Logica principale (calendario, dati, PDF) |
| `app-events.js` | Delega degli eventi dei pulsanti |
| `app-bootstrap.js` | Caricamento moduli non critici |
| `app-pdf.js` | Caricamento on-demand di `pdf-lib` |
| `pdf-lib.min.js` | Libreria PDF (usata solo alla generazione) |
| `modulo-ufficiale.pdf` | Modulo ufficiale in bianco (AcroForm compilabile) |
| `sw.js` | Service worker (cache offline) |
| `manifest.json`, `icon-*.png` | Metadati e icone PWA |

> `node_modules/` e gli artefatti di audit (`lighthouse-report.json`, `lhr-next.json`)
> non fanno parte dell'app: sono ignorati da git e non vanno pubblicati.

## Uso rapido

Apri `index.html` sul telefono (Chrome). Per installarla: menu ⋮ → "Aggiungi a
schermata Home".

## Pubblicazione su GitHub Pages

1. Carica i file dell'app (tutti tranne `node_modules/` e i report di audit).
2. Settings → Pages → Source: "Deploy from a branch" → `main` / `root` → Save.
3. Apri l'indirizzo mostrato (es. `https://tuonome.github.io/repo/`).

## Dati e backup

I dati sono salvati solo nel browser (localStorage). Usa **"Backup"** nella scheda
Riepilogo per esportare periodicamente una copia di sicurezza.
