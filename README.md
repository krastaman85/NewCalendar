# Calendario Diritti di Visita

App web (PWA) per **segnare i giorni di visita** di ogni figlio e **generare i moduli
mensili ufficiali** "Richiesta prestazione speciale per diritti di visita"
(USSI/URAR, Cantone Ticino) in PDF, già compilati e pronti per firma e data a mano.

I dati sono salvati **sul dispositivo** (localStorage). In più, facoltativamente, la
**sincronizzazione cloud** li copia in un database privato Supabase (server a Zurigo),
accessibile solo con l'account del proprietario: così telefono, PC e Claude vedono
lo stesso calendario. Nessuna analisi, nessun tracciamento.

## Funzionalità

- **Calendario per figlio** con colori distinti (verde / turchese, estendibile).
- **Vista combinata**: entrambi i figli sullo stesso calendario.
- **Statistiche (KPI)** su una sola riga, con transizioni fluide quando cambiano.
- **Data di nascita per figlio**: inserita nelle Impostazioni, viene compilata
  automaticamente nel modulo (campo "data di nascita").
- **Generazione PDF** del modulo ufficiale (via `pdf-lib`, caricato solo al bisogno).
- **Backup / ripristino** dei dati in JSON, con validazione anti-manomissione.
- **PWA installabile** e funzionante offline (service worker).
- **Sincronizzazione cloud** (facoltativa): ogni modifica parte subito se c'è rete,
  altrimenti resta in coda e parte appena la rete torna. Il database fa fede.
- **Storico modifiche** non cancellabile: data, ora, giorno, valore prima/dopo e autore.
- **Link di sola lettura**: con nome, scadenza (1 giorno – 1 anno), periodo facoltativo,
  contatore delle aperture e revoca immediata. Mostra anche le note e permette il prospetto.
- **Note del giorno**: pressione lunga su un giorno (o «✎ Note» e tocco). Sincronizzate e
  registrate nello storico.
- **Schema ricorrente** (settimana A/B) nelle Impostazioni e «📋 Applica schema»: completa
  solo i giorni vuoti del mese, per tutti i figli.
- **Annulla** dopo ogni modifica (7 secondi).
- **Prospetto** stampabile/PDF (Riepilogo → 🧾): totali mensili e dettaglio giorno per giorno con note.
- **Promemoria** dal 28 al 5: ricorda di preparare i moduli del mese.
- **Navigazione** ‹ › tra le schermate, tasto Indietro di Android, frecce ← →, «📍 Oggi».
- **Accessibilità**: giorni con etichette vocali per TalkBack, attivabili da tastiera (Invio, N = nota).
- **Recupero password** via e-mail.
- **Navigazione a gesto** (swipe) per cambiare mese; design animato e responsivo.

## Struttura dei file

| File | Ruolo |
|------|-------|
| `index.html` | Struttura della pagina (markup) |
| `app.css` | Stili, animazioni, responsività |
| `app-core.js` | Logica principale (calendario, dati, PDF) |
| `app-sync.js` | Sincronizzazione cloud, storico, link di sola lettura |
| `cloud-config.js` | Indirizzo del database e chiave pubblica (non segreta) |
| `supabase.min.js` | Libreria client Supabase v2 (copia locale, niente CDN) |
| `supabase/schema.sql` | Struttura del database, regole di accesso, funzioni |
| `app-extra.js` | Note, annulla, schema ricorrente, prospetto, promemoria |
| `tools/genera-moduli.cjs` | Genera i moduli PDF da riga di comando (usato dall'attività mensile) |
| `.github/workflows/database-attivo.yml` | Ping due volte a settimana per tenere attivo il database |
| `tests/collaudo_sync.py` | Collaudo end-to-end sul database reale (utente di prova) |
| `tests/collaudo_app_simulato.py` | Collaudo dell'app con database simulato (42 controlli) |
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

I dati sono salvati nel browser (localStorage) e, se la sincronizzazione è attiva, nel
database. Usa comunque **"Backup"** nella scheda Riepilogo per una copia di sicurezza.

## Sincronizzazione cloud

- Progetto Supabase `diritti-visita` (regione `eu-central-2`, Zurigo).
- **Un solo account** può esistere: il database rifiuta ogni registrazione successiva.
- **Row Level Security** su tutte le tabelle: ogni riga è visibile solo al proprietario.
- La chiave in `cloud-config.js` è la *publishable key*: è pubblica per definizione e
  da sola non dà accesso ai dati. Le chiavi segrete (service_role) non vanno mai nel repo.
- Primo collegamento di un dispositivo: si salva una copia locale
  (`diritti_visita_presync_backup_v1`), poi i giorni presenti solo sul dispositivo
  vengono caricati; sui giorni in conflitto vale il database.
- Vista in sola lettura: `…/NewCalendar/#view=<token>`; il token è nel frammento `#`,
  quindi non arriva nei log del server. La vista non scrive nulla sul dispositivo
  di chi la apre.

### Collaudo

```bash
python3 -m pip install playwright
python3 tests/collaudo_sync.py   # richiede un utente di prova nel database
```
