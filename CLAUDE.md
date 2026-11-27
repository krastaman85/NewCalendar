# NewCalendar: memoria di progetto (leggila prima di lavorare)

Se questo file e il repo divergono, fidati del repo e correggi il file. Il `README.md` è la fonte dettagliata.

## Cos'è
«Calendario Diritti di Visita»: app web (PWA) per segnare i giorni di visita di ogni figlio e generare in PDF i moduli mensili ufficiali «Richiesta prestazione speciale per diritti di visita» (USSI/URAR, Cantone Ticino), già compilati e da firmare a mano.

## Privacy (non negoziabile)
Sono dati sensibili di minori. Dal 27.11.2026, su decisione di Davide, i dati possono essere sincronizzati **solo** nel suo database Supabase privato `diritti-visita` (Zurigo), con RLS, un solo account e storico immutabile. Nessun altro server, nessuna analisi, nessun tracciamento, nessuna condivisione salvo i link di sola lettura creati da lui (revocabili, con scadenza). L'app deve continuare a funzionare anche senza cloud.

## Struttura
`index.html` (markup), `app.css`, `app-core.js` (logica: calendario, dati, PDF), `app-sync.js` (cloud, storico, sola lettura), `cloud-config.js` (URL + chiave pubblica), `supabase.min.js`, `supabase/schema.sql`, `tests/collaudo_sync.py`, `app-events.js`, `app-bootstrap.js`, `app-pdf.js` + `pdf-lib.min.js` (PDF solo alla generazione), `modulo-ufficiale.pdf` (modulo in bianco compilabile), `sw.js` (offline), `manifest.json` e `icon-*.png`. `node_modules/` e i report di audit non fanno parte dell'app e non vanno pubblicati.

## Pubblicazione
Descritta nel README: GitHub Pages (`main`, root; file `.nojekyll` presente). Non verificato dalla sessione che il sito sia attivo oggi.

## Regole di lavoro dell'utente
Italiano, chiaro e operativo. Distinguere dati da inferenze. Dire cosa fa l'utente e cosa fa Claude. Se manca un'informazione importante, chiedere prima. Non pubblicare, inviare o cancellare senza conferma. Nessun token o chiave segreta in chat o nei file (la publishable key Supabase in `cloud-config.js` è pubblica per definizione ed è ammessa). Una sola sessione di lavoro alla volta, con titolo «NewCalendar – …».

## Database (Supabase `diritti-visita`, ref `cbsqavoengtdloirtxxz`)
Tabelle: `visits` (user_id, child, day, kind 'pern'|'sing'), `app_settings`, `visits_audit` (storico, scritto da trigger, non modificabile dai client), `share_links` (token, scadenza, revoca). Funzione pubblica solo `get_shared_calendar(token)`. Trigger `un_solo_proprietario` su `auth.users`. Le correzioni fatte da Claude via SQL compaiono nello storico come «amministrazione SQL».
