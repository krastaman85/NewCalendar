# Calendario Diritti di Visita — v2

**Aggiornamento**: logo e header ridisegnati, nomi propri rimossi dal titolo (privacy), vista combinata corretta (bug risolto), colore blu fluo al posto del viola, footer con firma DD, sicurezza rinforzata (Content-Security-Policy, escaping anti-injection, validazione backup).

App per segnare, gestire e generare mensilmente i moduli ufficiali
"Richiesta prestazione speciale per diritti di visita" (USSI/URAR, Cantone Ticino).

## Novità di questa versione

- **Colori per figlio**: Figlio 1 verde, Figlio 2 turchese (estendibile ad altri figli)
- **Vista combinata**: mostra entrambi i figli sullo stesso calendario senza cambiare scheda
- **Navigazione a gesto**: scorri a sinistra/destra sul calendario per cambiare mese
- **Design rinnovato**: superfici con profondità, statistiche più chiare, animazioni fluide
- **Icone e manifest arricchiti**: icone maskable per Android, scorciatoie rapide ("Genera moduli", "Riepilogo")

## Uso rapido (senza pubblicare nulla)

Apri **index.html** direttamente sul telefono (in Chrome). Tutti i dati restano
sul tuo dispositivo. Per installarla: menu Chrome ⋮ → "Aggiungi a schermata Home".

## Pubblicazione su GitHub Pages

1. Crea un repository pubblico su GitHub.
2. Carica i 9 file di questa cartella: `index.html`, `app.css`, `app.js`,
   `manifest.json`, `sw.js`, `icon-192.png`, `icon-192-maskable.png`,
   `icon-512.png`, `icon-512-maskable.png`.
3. Settings → Pages → Source: "Deploy from a branch" → Branch: `main` / `root` → Save.
4. Attendi 1-2 minuti, poi apri l'indirizzo mostrato (es. `https://tuonome.github.io/repo/`).
5. Apri quel link sul telefono in Chrome: dopo pochi secondi comparirà il banner
   "Aggiungi alla schermata Home" automatico.

## Dati e backup

I dati (giorni segnati, impostazioni, elenco figli, colori) sono salvati solo
nella memoria del browser (localStorage) — nessun server, nessuna condivisione
con terzi. Usa **"Backup"** nella scheda Riepilogo per esportare una copia di
sicurezza periodicamente.
