# NewCalendar: memoria di progetto (leggila prima di lavorare)

Se questo file e il repo divergono, fidati del repo e correggi il file. Il `README.md` è la fonte dettagliata.

## Cos'è
«Calendario Diritti di Visita»: app web (PWA) per segnare i giorni di visita di ogni figlio e generare in PDF i moduli mensili ufficiali «Richiesta prestazione speciale per diritti di visita» (USSI/URAR, Cantone Ticino), già compilati e da firmare a mano.

## Privacy (non negoziabile)
Tutti i dati restano **solo sul dispositivo** (localStorage). Nessun server, nessuna condivisione con terzi. Non aggiungere analisi, tracciamento o invio dati. Sono dati sensibili di minori.

## Struttura
`index.html` (markup), `app.css`, `app-core.js` (logica: calendario, dati, PDF), `app-events.js`, `app-bootstrap.js`, `app-pdf.js` + `pdf-lib.min.js` (PDF solo alla generazione), `modulo-ufficiale.pdf` (modulo in bianco compilabile), `sw.js` (offline), `manifest.json` e `icon-*.png`. `node_modules/` e i report di audit non fanno parte dell'app e non vanno pubblicati.

## Pubblicazione
Descritta nel README: GitHub Pages (`main`, root; file `.nojekyll` presente). Non verificato dalla sessione che il sito sia attivo oggi.

## Regole di lavoro dell'utente
Italiano, chiaro e operativo. Distinguere dati da inferenze. Dire cosa fa l'utente e cosa fa Claude. Se manca un'informazione importante, chiedere prima. Non pubblicare, inviare o cancellare senza conferma. Nessun token o chiave in chat o nei file. Una sola sessione di lavoro alla volta, con titolo «NewCalendar – …».
