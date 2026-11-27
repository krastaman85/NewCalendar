// Configurazione della sincronizzazione cloud (Supabase, server a Zurigo).
//
// La "publishable key" qui sotto NON è un segreto: è la chiave pubblica che
// ogni app web Supabase deve inviare dal browser. Da sola non dà accesso a
// nessun dato. La protezione è nel database:
//   - Row Level Security: ogni riga è leggibile/modificabile solo dal suo
//     proprietario autenticato;
//   - un solo account può esistere (le registrazioni successive sono rifiutate);
//   - l'accesso anonimo è possibile solo tramite link di sola lettura con
//     token casuale, scadenza e revoca.
// Chiavi segrete (service_role, password, token personali) non vanno MAI
// inserite in questo repository.
window.CLOUD_CONFIG = Object.freeze({
  url: "https://cbsqavoengtdloirtxxz.supabase.co",
  key: "sb_publishable_J71BnbbjiAyUE8D2UfsAjA_oSjRCLM_",
  appUrl: "https://krastaman85.github.io/NewCalendar/",
});
