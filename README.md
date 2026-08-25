# Calendario Diritti di Visita

App per segnare, gestire e generare mensilmente i moduli ufficiali
"Richiesta prestazione speciale per diritti di visita" (USSI/URAR, Cantone Ticino).

## Uso rapido (senza pubblicare nulla)

Basta aprire **index.html** direttamente sul telefono (in Chrome). L'app
funziona subito, tutti i dati restano salvati solo sul tuo dispositivo.
Per installarla come icona: menu Chrome ⋮ → "Aggiungi a schermata Home".

## Pubblicazione su GitHub Pages (per l'installazione automatica completa)

Se vuoi che Chrome mostri il banner automatico "Installa app" (invece del
comando manuale), serve pubblicare i file su un sito vero (https). GitHub
Pages lo offre gratis. Passi:

1. Crea un account su [github.com](https://github.com) se non ne hai già uno.
2. Crea un nuovo repository (es. `diritti-visita-app`), pubblico.
3. Carica in questo repository i 5 file presenti in questa cartella:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `icon-192.png`
   - `icon-512.png`
4. Vai su **Settings → Pages** del repository.
5. In "Source" scegli il branch `main` e la cartella `/ (root)`, poi Salva.
6. Dopo 1-2 minuti il sito sarà disponibile su:
   `https://TUO-NOME-UTENTE.github.io/diritti-visita-app/`
7. Apri quel link sul telefono, in Chrome. Dopo qualche secondo comparirà
   il banner "Aggiungi Diritti Visita alla schermata Home" — conferma.

Da quel momento l'app si comporta come un'app installata a tutti gli
effetti: icona propria, si apre a schermo intero, funziona anche offline
(il Service Worker mette in cache tutto al primo avvio).

## Aggiornare l'app in futuro

Se in seguito modifichi `index.html` (o te lo preparo aggiornato), basta
ricaricare il nuovo file sullo stesso repository GitHub: il Service
Worker rileverà la nuova versione e la applicherà al riavvio successivo
dell'app.

## Dati e backup

I dati (giorni segnati, impostazioni, elenco figli) sono salvati soltanto
nella memoria del browser del tuo telefono (localStorage) — nessun server,
nessuna condivisione automatica con terzi. Usa il pulsante
**"Backup dati (JSON)"** nella scheda Riepilogo annuale per esportare
periodicamente una copia di sicurezza, specialmente prima di cambiare
telefono o disinstallare l'app.

## Struttura dei moduli generati

I PDF generati dalla scheda "Genera moduli" sono gli stessi moduli
ufficiali forniti dall'Ufficio del sostegno sociale, compilati
automaticamente nei campi:

- Funzionario incaricato, Cognome e nome, Domicilio (da Impostazioni)
- Figlio e mese (dal calendario)
- Giorni con pernottamento / giorno singolo (da quanto segnato nel
  calendario di quel mese)

**Restano da completare a mano**, come da prassi ufficiale: data e firma
del richiedente, e la conferma controfirmata dall'altro genitore in fondo
al modulo.
