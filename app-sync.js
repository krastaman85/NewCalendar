// ══════════════════════════════════════════════════════════════════════
// SINCRONIZZAZIONE CLOUD (Supabase) + VISTA IN SOLA LETTURA
//
// Principio: l'app resta "offline-first". Ogni modifica viene salvata subito
// in locale (localStorage, come prima) e messa in una coda; la coda viene
// inviata al database appena c'è rete e l'utente ha effettuato l'accesso.
// All'avvio, al ritorno in primo piano e ogni minuto l'app scarica lo stato
// del database, che fa fede, riapplicando sopra le modifiche ancora in coda.
//
// Dipende da: cloud-config.js (window.CLOUD_CONFIG), supabase.min.js
// (window.supabase) e dalle funzioni/variabili globali di app-core.js
// (DATA, activeChild, curYear, curMonth, saveData, renderCalendar, ...).
// ══════════════════════════════════════════════════════════════════════
(() => {
  "use strict";

  const CFG = window.CLOUD_CONFIG || null;
  const QUEUE_KEY = "diritti_visita_sync_queue_v1";
  const STATE_KEY = "diritti_visita_sync_state_v1";
  const PRESYNC_KEY = "diritti_visita_presync_backup_v1";
  const PULL_INTERVAL_MS = 60000;
  const RETRY_MS = 30000;
  const CHUNK = 400;
  const SEP = "\u0001";

  const $ = (id) => document.getElementById(id);

  let sb = null;
  let user = null;
  let busy = null;
  let again = false;
  let debounceTimer = null;
  let syncState = "off";      // off | ok | pending | syncing | offline | error | readonly
  let lastError = "";

  // ── utilità ───────────────────────────────────────────────────────────
  function readJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (raw == null) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (_) { return fallback; }
  }
  function writeJSON(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (_) {}
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function isoDate(y, m, d) { return `${y}-${pad2(m + 1)}-${pad2(d)}`; }
  function swissDate(iso) {
    if (!iso) return "";
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : "";
  }
  function swissDateTime(ts) {
    const d = new Date(ts);
    if (isNaN(d)) return "";
    return `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}.${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  }
  function kindLabel(k) { return k === "pern" ? "pernottamento" : k === "sing" ? "giorno singolo" : "nessuna visita"; }
  function errMsg(e) {
    if (!e) return "Errore sconosciuto";
    const m = e.message || e.error_description || String(e);
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return "Rete non disponibile";
    if (/Invalid login credentials/i.test(m)) return "E-mail o password non corretti";
    if (/Email not confirmed/i.test(m)) return "Account non ancora attivato";
    if (/Database error saving new user|già un proprietario/i.test(m)) return "Registrazione non consentita: il calendario ha già un proprietario";
    if (/Password should be/i.test(m)) return "Password troppo corta (minimo 6 caratteri, consigliati 12+)";
    return m;
  }

  // entries {"aaaa-mm": {figlio: {giorno: "pern"|"sing"}}} → Map "figlio␁aaaa-mm-gg" → tipo
  function flatten(entries) {
    const out = new Map();
    if (!entries || typeof entries !== "object") return out;
    for (const mk of Object.keys(entries)) {
      if (!/^\d{4}-\d{2}$/.test(mk)) continue;
      const month = entries[mk];
      if (!month || typeof month !== "object") continue;
      for (const child of Object.keys(month)) {
        const days = month[child];
        if (!days || typeof days !== "object") continue;
        for (const dk of Object.keys(days)) {
          const kind = days[dk];
          const d = parseInt(dk, 10);
          if ((kind !== "pern" && kind !== "sing") || !(d >= 1 && d <= 31)) continue;
          out.set(child + SEP + mk + "-" + pad2(d), kind);
        }
      }
    }
    return out;
  }
  function setInEntries(entries, child, iso, kind) {
    const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return;
    const mk = `${m[1]}-${m[2]}`;
    const d = parseInt(m[3], 10);
    if (kind === "pern" || kind === "sing") {
      if (!entries[mk]) entries[mk] = {};
      if (!entries[mk][child]) entries[mk][child] = {};
      entries[mk][child][d] = kind;
    } else if (entries[mk] && entries[mk][child]) {
      delete entries[mk][child][d];
    }
  }
  function signature(entries) {
    return [...flatten(entries).entries()].map(([k, v]) => k + "=" + v).sort().join("\n");
  }

  // ── coda delle modifiche ──────────────────────────────────────────────
  function loadQueue() {
    const q = readJSON(QUEUE_KEY, null);
    if (!q || typeof q !== "object" || !q.days || typeof q.days !== "object") return { days: {}, notes: {}, settings: 0 };
    return { days: q.days, notes: (q.notes && typeof q.notes === "object") ? q.notes : {}, settings: Number(q.settings) || 0 };
  }
  let queue = loadQueue();
  let ver = Date.now();
  function saveQueue() { writeJSON(QUEUE_KEY, queue); }
  function pendingCount() { return Object.keys(queue.days).length + Object.keys(queue.notes).length + (queue.settings ? 1 : 0); }

  let state = readJSON(STATE_KEY, {});
  if (!state || typeof state !== "object") state = {};
  function saveState() { writeJSON(STATE_KEY, state); }
  function linked() { return !!state.userId; }

  function enqueueDay(child, iso, kind) {
    queue.days[child + SEP + iso] = { kind: kind || null, v: ++ver };
  }

  // ── API chiamata da app-core.js ──────────────────────────────────────
  function dayChanged(child, y, m, d, kind) {
    if (!linked()) return;
    enqueueDay(child, isoDate(y, m, d), kind);
    saveQueue();
    scheduleSync(700);
  }
  function entriesChanged(before) {
    if (!linked()) return;
    const a = flatten(before);
    const b = flatten(DATA.entries);
    let n = 0;
    for (const [k, v] of b) if (a.get(k) !== v) { queue.days[k] = { kind: v, v: ++ver }; n++; }
    for (const k of a.keys()) if (!b.has(k)) { queue.days[k] = { kind: null, v: ++ver }; n++; }
    if (n) { saveQueue(); scheduleSync(700); }
  }
  function notesChanged(before) {
    if (!linked()) return;
    const a = before || {};
    const b = DATA.notes || {};
    let n = 0;
    for (const k of Object.keys(b)) if (a[k] !== b[k]) { queue.notes[k] = { text: b[k], v: ++ver }; n++; }
    for (const k of Object.keys(a)) if (!(k in b)) { queue.notes[k] = { text: null, v: ++ver }; n++; }
    if (n) { saveQueue(); scheduleSync(700); }
  }
  function settingsChanged() {
    if (!linked()) return;
    queue.settings = ++ver;
    saveQueue();
    scheduleSync(700);
  }

  // ── accesso al database ───────────────────────────────────────────────
  async function fetchAllVisits() {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("visits")
        .select("child,day,kind")
        .order("day", { ascending: true })
        .order("child", { ascending: true })
        .range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  }
  async function fetchAllNotes() {
    const rows = [];
    for (let from = 0; ; from += 1000) {
      const { data, error } = await sb.from("day_notes").select("day,note").order("day").range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
    }
    return rows;
  }
  async function fetchSettings() {
    const { data, error } = await sb.from("app_settings")
      .select("profile,children,birthdates,schedule,updated_at")
      .maybeSingle();
    if (error) throw error;
    return data;
  }
  async function uploadSettings() {
    const v = queue.settings;
    const { error } = await sb.from("app_settings").upsert({
      user_id: user.id,
      profile: DATA.profile || {},
      children: DATA.children || [],
      birthdates: DATA.birthdates || {},
      schedule: DATA.schedule || {},
    }, { onConflict: "user_id" });
    if (error) throw error;
    if (queue.settings === v) { queue.settings = 0; saveQueue(); }
  }
  function markDone(part) {
    for (const p of part) {
      const cur = queue.days[p.key];
      if (cur && cur.v === p.v) delete queue.days[p.key];
    }
    saveQueue();
  }
  async function flushNotes() {
    const ups = [], dels = [];
    for (const [iso, op] of Object.entries(queue.notes)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) { delete queue.notes[iso]; continue; }
      if (op.text) ups.push({ iso, v: op.v, row: { user_id: user.id, day: iso, note: String(op.text).slice(0, 500) } });
      else dels.push({ iso, v: op.v });
    }
    const done = (part) => {
      for (const p of part) { const cur = queue.notes[p.iso]; if (cur && cur.v === p.v) delete queue.notes[p.iso]; }
      saveQueue();
    };
    for (let i = 0; i < ups.length; i += CHUNK) {
      const part = ups.slice(i, i + CHUNK);
      const { error } = await sb.from("day_notes").upsert(part.map(p => p.row), { onConflict: "user_id,day" });
      if (error) throw error;
      done(part);
    }
    for (let i = 0; i < dels.length; i += CHUNK) {
      const part = dels.slice(i, i + CHUNK);
      const { error } = await sb.from("day_notes").delete().in("day", part.map(p => p.iso));
      if (error) throw error;
      done(part);
    }
  }
  async function flush() {
    if (queue.settings) await uploadSettings();
    await flushNotes();
    const ups = [];
    const dels = new Map();
    for (const [key, op] of Object.entries(queue.days)) {
      const i = key.indexOf(SEP);
      const child = key.slice(0, i);
      const iso = key.slice(i + 1);
      if (!child || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) { delete queue.days[key]; continue; }
      if (op.kind === "pern" || op.kind === "sing") {
        ups.push({ key, v: op.v, row: { user_id: user.id, child, day: iso, kind: op.kind } });
      } else {
        if (!dels.has(child)) dels.set(child, []);
        dels.get(child).push({ key, v: op.v, iso });
      }
    }
    for (let i = 0; i < ups.length; i += CHUNK) {
      const part = ups.slice(i, i + CHUNK);
      const { error } = await sb.from("visits").upsert(part.map(p => p.row), { onConflict: "user_id,child,day" });
      if (error) throw error;
      markDone(part);
    }
    for (const [child, list] of dels) {
      for (let i = 0; i < list.length; i += CHUNK) {
        const part = list.slice(i, i + CHUNK);
        const { error } = await sb.from("visits").delete().eq("child", child).in("day", part.map(p => p.iso));
        if (error) throw error;
        markDone(part);
      }
    }
  }

  function applyServerSettings(s) {
    if (!s || typeof sanitizeBackupData !== "function") return false;
    const safe = sanitizeBackupData({ profile: s.profile, children: s.children, birthdates: s.birthdates, entries: {} });
    if (!safe) return false;
    const before = JSON.stringify([DATA.profile, DATA.children, DATA.birthdates]);
    DATA.profile = safe.profile;
    if (Array.isArray(s.children) && s.children.length) DATA.children = safe.children;
    DATA.birthdates = safe.birthdates;
    if (s.schedule && Array.isArray(s.schedule.A) && typeof sanitizeSchedule === "function") DATA.schedule = sanitizeSchedule(s.schedule);
    return before !== JSON.stringify([DATA.profile, DATA.children, DATA.birthdates]);
  }

  async function pull() {
    const rows = await fetchAllVisits();
    const settings = await fetchSettings();
    const entries = {};
    for (const r of rows) setInEntries(entries, r.child, r.day, r.kind);
    for (const [key, op] of Object.entries(queue.days)) {
      const i = key.indexOf(SEP);
      setInEntries(entries, key.slice(0, i), key.slice(i + 1), op.kind);
    }
    const changedEntries = signature(entries) !== signature(DATA.entries);
    if (changedEntries) DATA.entries = entries;
    const noteRows = await fetchAllNotes();
    const notes = {};
    for (const r of noteRows) notes[r.day] = r.note;
    for (const [iso, op] of Object.entries(queue.notes)) { if (op.text) notes[iso] = op.text; else delete notes[iso]; }
    const sigN = (o) => JSON.stringify(Object.keys(o || {}).sort().map(k => [k, o[k]]));
    const changedNotes = sigN(notes) !== sigN(DATA.notes);
    if (changedNotes) DATA.notes = notes;
    const changedSettings = !queue.settings && applyServerSettings(settings);
    // Impostazioni assenti nel database, oppure senza schema ricorrente
    // (account creato prima della versione con lo schema): si caricano quelle locali.
    const noSchedule = settings && !(settings.schedule && Array.isArray(settings.schedule.A));
    if ((!settings || noSchedule) && !queue.settings) { queue.settings = ++ver; saveQueue(); scheduleSync(500); }
    if (changedEntries || changedSettings || changedNotes) {
      saveData();
      rerenderApp();
    }
    if (changedSettings) {
      const m = $("settingsModal");
      if (m && m.classList.contains("show") && typeof refreshSettingsForm === "function") refreshSettingsForm();
    }
  }

  // Primo collegamento di questo dispositivo all'account: unisce i dati.
  // Il database fa fede sui giorni in conflitto; i giorni presenti solo sul
  // dispositivo vengono caricati. Prima si salva una copia locale di sicurezza.
  async function linkDevice() {
    writeJSON(PRESYNC_KEY, { savedAt: new Date().toISOString(), data: DATA });
    const rows = await fetchAllVisits();
    const server = new Set(rows.map(r => r.child + SEP + r.day));
    let uploaded = 0;
    for (const [k, kind] of flatten(DATA.entries)) {
      if (!server.has(k)) { queue.days[k] = { kind, v: ++ver }; uploaded++; }
    }
    const serverNotes = new Set((await fetchAllNotes()).map(r => r.day));
    for (const [iso, text] of Object.entries(DATA.notes || {})) {
      if (!serverNotes.has(iso)) { queue.notes[iso] = { text, v: ++ver }; uploaded++; }
    }
    const s = await fetchSettings();
    if (!s) queue.settings = ++ver;
    saveQueue();
    state = { userId: user.id, email: user.email || "", linkedAt: new Date().toISOString() };
    saveState();
    await flush();
    await pull();
    if (uploaded) toast(`☁️ ${uploaded} elementi caricati nel cloud`);
  }

  function rerenderApp() {
    if (!DATA.children.includes(activeChild)) activeChild = DATA.children[0] || "";
    renderCalendar();
    const summary = $("panel-summary");
    if (summary && summary.classList.contains("active")) renderYearSummary();
    if (typeof invalidateGenerated === "function") invalidateGenerated();
  }

  // ── ciclo di sincronizzazione ─────────────────────────────────────────
  function scheduleSync(delay = 0) {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => { sync(); }, delay);
  }
  async function sync() {
    if (!sb || !user) { updateBadge(); return; }
    if (busy) { again = true; return busy; }
    busy = (async () => {
      setState("syncing");
      try {
        if (state.userId !== user.id) await linkDevice();
        else { await flush(); await pull(); }
        state.lastSync = new Date().toISOString();
        saveState();
        loadAgentRequests();
        lastError = "";
        setState(pendingCount() ? "pending" : "ok");
      } catch (e) {
        lastError = errMsg(e);
        setState(navigator.onLine === false || lastError === "Rete non disponibile" ? "offline" : "error");
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => sync(), RETRY_MS);
      } finally {
        busy = null;
        if (again) { again = false; scheduleSync(300); }
      }
    })();
    return busy;
  }

  function setState(s) { syncState = s; updateBadge(); renderSyncPanel(); }

  function updateBadge() {
    const b = $("syncBadge");
    if (!b) return;
    let txt = "☁️", title = "";
    if (!CFG || !window.supabase) { b.hidden = true; return; }
    b.hidden = false;
    if (!user) { txt = "☁️ ⏻"; title = "Sincronizzazione non attiva: accedi dalle Impostazioni"; }
    else if (syncState === "syncing") { txt = "☁️ …"; title = "Sincronizzazione in corso"; }
    else if (syncState === "error") { txt = "☁️ ⚠"; title = "Errore di sincronizzazione: " + lastError; }
    else if (syncState === "offline") { txt = "☁️ ⨯"; title = "Senza rete: le modifiche restano sul dispositivo e partiranno appena possibile"; }
    else if (pendingCount()) { txt = "☁️ " + pendingCount(); title = pendingCount() + " modifiche in attesa di invio"; }
    else { txt = "☁️ ✓"; title = "Sincronizzato" + (state.lastSync ? " · " + swissDateTime(state.lastSync) : ""); }
    b.textContent = txt;
    b.title = title;
    b.setAttribute("aria-label", title);
    b.dataset.state = !user ? "off" : syncState;
  }

  // ── pannello nelle Impostazioni ──────────────────────────────────────
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function btn(label, cls, handler) {
    const b = el("button", "btn " + (cls || ""), label);
    b.type = "button";
    b.addEventListener("click", handler);
    return b;
  }
  function setMsg(text, isError) {
    const m = $("syncMsg");
    if (!m) return;
    m.textContent = text || "";
    m.classList.toggle("err", !!isError);
  }

  function renderSyncPanel() {
    const box = $("syncPanel");
    if (!box) return;
    const statusEl = $("syncStatus");
    const authBox = $("syncAuth");
    const userBox = $("syncUser");
    if (!CFG || !window.supabase) {
      statusEl.textContent = "Sincronizzazione non disponibile in questa versione.";
      authBox.hidden = true; userBox.hidden = true;
      return;
    }
    if (!user) {
      statusEl.textContent = "Non collegato: i dati restano solo su questo dispositivo.";
      authBox.hidden = false; userBox.hidden = true;
      return;
    }
    authBox.hidden = true; userBox.hidden = false;
    let s = `Collegato come ${user.email || "utente"}. `;
    if (syncState === "syncing") s += "Sincronizzazione in corso…";
    else if (syncState === "error") s += "Errore: " + lastError;
    else if (syncState === "offline") s += "Senza rete: le modifiche partiranno appena possibile.";
    else if (pendingCount()) s += pendingCount() + " modifiche in attesa.";
    else s += "Tutto sincronizzato" + (state.lastSync ? " (" + swissDateTime(state.lastSync) + ")." : ".");
    statusEl.textContent = s;
  }

  // Chiede al gestore password del telefono/browser di salvare le credenziali.
  async function storeCredential(email, password) {
    try {
      if (window.PasswordCredential && navigator.credentials && navigator.credentials.store) {
        await navigator.credentials.store(new window.PasswordCredential({ id: email, password, name: email }));
      }
    } catch (_) { /* non supportato: nessun problema */ }
  }

  async function doSignIn() {
    const email = ($("syncEmail").value || "").trim();
    const password = $("syncPassword").value || "";
    if (!email || !password) { setMsg("Inserisci e-mail e password.", true); return; }
    setMsg("Accesso in corso…");
    const { error } = await sb.auth.signInWithPassword({ email, password });
    if (error) { $("syncPassword").value = ""; setMsg(errMsg(error), true); return; }
    await storeCredential(email, password);
    $("syncPassword").value = "";
    setMsg("Accesso effettuato. Sincronizzo…");
  }
  async function doSignUp() {
    const email = ($("syncEmail").value || "").trim();
    const password = $("syncPassword").value || "";
    if (!email || password.length < 12) { setMsg("Inserisci l'e-mail e una password di almeno 12 caratteri.", true); return; }
    if (!confirm("Creare l'account proprietario del calendario con " + email + "?\nSi può creare un solo account.")) return;
    setMsg("Creazione account…");
    const { data, error } = await sb.auth.signUp({ email, password });
    if (error) { $("syncPassword").value = ""; setMsg(errMsg(error), true); return; }
    await storeCredential(email, password);
    $("syncPassword").value = "";
    if (data && data.session) setMsg("Account creato e collegato. Sincronizzo…");
    else setMsg("Account creato. Deve essere attivato: conferma dal link nell'e-mail ricevuta oppure chiedi a Claude di attivarlo, poi premi «Accedi».");
  }
  async function doForgot() {
    const email = ($("syncEmail").value || "").trim();
    if (!email) { setMsg("Scrivi la tua e-mail nel campo qui sopra, poi premi di nuovo «Password dimenticata?».", true); return; }
    setMsg("Invio dell'e-mail in corso…");
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: CFG.appUrl });
    if (error) { setMsg(errMsg(error), true); return; }
    setMsg("Se l'indirizzo è corretto riceverai un'e-mail: apri il link su questo dispositivo e scegli la nuova password.");
  }
  async function doResetSave() {
    const pw = $("newPassword").value || "";
    if (pw.length < 12) { setMsg("La nuova password deve avere almeno 12 caratteri.", true); return; }
    const { data, error } = await sb.auth.updateUser({ password: pw });
    if (error) { setMsg(errMsg(error), true); return; }
    await storeCredential((data && data.user && data.user.email) || (user && user.email) || "", pw);
    $("newPassword").value = "";
    $("pwResetBox").hidden = true;
    setMsg("Password aggiornata. Sei collegato.");
    scheduleSync(100);
  }
  function showPasswordReset() {
    openModal("settingsModal");
    const box = $("pwResetBox");
    if (box) { box.hidden = false; setTimeout(() => { box.scrollIntoView({ block: "center" }); $("newPassword").focus(); }, 80); }
    setMsg("Collegamento dall'e-mail riconosciuto: scegli la nuova password.");
  }

  async function doSignOut() {
    const n = pendingCount();
    const msg = n
      ? `Ci sono ${n} modifiche non ancora inviate al cloud. Uscendo resteranno solo su questo dispositivo. Uscire comunque?`
      : "Scollegare questo dispositivo dal cloud? I dati restano salvati sul dispositivo.";
    if (!confirm(msg)) return;
    await sb.auth.signOut();
    queue = { days: {}, notes: {}, settings: 0 }; saveQueue();
    renderAgentRequests([]);
    state = {}; saveState();
    setMsg("Dispositivo scollegato.");
    setState("off");
  }

  // ── storico modifiche ─────────────────────────────────────────────────
  async function showHistory() {
    const list = $("historyList");
    list.textContent = "Caricamento…";
    const { data, error } = await sb.from("visits_audit")
      .select("entity,child,day,old_kind,new_kind,old_note,new_note,changed_at,actor")
      .order("changed_at", { ascending: false })
      .limit(100);
    list.textContent = "";
    if (error) { list.textContent = errMsg(error); return; }
    if (!data.length) { list.textContent = "Nessuna modifica registrata."; return; }
    data.forEach(r => {
      const row = el("div", "hist-row");
      const q = (t) => t ? `«${t.length > 60 ? t.slice(0, 60) + "…" : t}»` : "nessuna";
      row.appendChild(el("div", "hist-main", r.entity === "nota"
        ? `Nota del ${swissDate(r.day)}: ${q(r.old_note)} → ${q(r.new_note)}`
        : `${r.child} · ${swissDate(r.day)}: ${kindLabel(r.old_kind)} → ${kindLabel(r.new_kind)}`));
      row.appendChild(el("div", "hist-meta", `${swissDateTime(r.changed_at)} · ${r.actor}`));
      list.appendChild(row);
    });
  }

  // ── richieste dell'agente ─────────────────────────────────────────────
  // L'agente (attività programmate di Claude) scrive richieste nel database;
  // qui l'utente risponde. Le conferme di un giorno vengono applicate come una
  // normale modifica dell'utente (storico: «app»), mai dall'agente.
  const PRIO = { urgente: "🔴", alta: "🟠", normale: "🔵", bassa: "⚪" };
  async function loadAgentRequests() {
    const box = $("agentInbox");
    if (!box || !sb || !user) { if (box) box.hidden = true; return; }
    const { data, error } = await sb.from("agent_requests")
      .select("id,created_at,kind,priority,title,body,payload,link,due_date,status,expires_at")
      .eq("status", "aperta")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) return; // tabella non ancora disponibile o rete assente: nessun disturbo
    const now = Date.now();
    const open = (data || []).filter(r => !r.expires_at || new Date(r.expires_at).getTime() > now);
    const rank = { urgente: 0, alta: 1, normale: 2, bassa: 3 };
    open.sort((a, b) => (rank[a.priority] - rank[b.priority]) || (a.created_at < b.created_at ? 1 : -1));
    renderAgentRequests(open);
  }
  function renderAgentRequests(list) {
    const box = $("agentInbox"), wrap = $("agentList");
    wrap.textContent = "";
    box.hidden = !list.length;
    $("agentCount").textContent = list.length ? `(${list.length})` : "";
    list.forEach(r => {
      const card = el("div", "agent-card prio-" + r.priority);
      card.appendChild(el("div", "agent-head", `${PRIO[r.priority] || ""} ${r.title}`));
      if (r.body) card.appendChild(el("div", "agent-body", r.body));
      const meta = [];
      if (r.due_date) meta.push("scadenza " + swissDate(r.due_date));
      meta.push("ricevuta " + swissDateTime(r.created_at));
      card.appendChild(el("div", "hist-meta", meta.join(" · ")));
      const acts = el("div", "share-actions");
      const p = r.payload || {};
      if (r.kind === "conferma_giorno" && p.child && /^\d{4}-\d{2}-\d{2}$/.test(p.day || "") && (p.kind === "pern" || p.kind === "sing" || p.kind === null)) {
        acts.appendChild(btn(`✓ Sì, segna ${kindLabel(p.kind)}`, "primary", () => answerRequest(r, "sì", true)));
        acts.appendChild(btn("✗ No", "ghost", () => answerRequest(r, "no")));
      } else {
        acts.appendChild(btn("✓ Visto", "", () => answerRequest(r, "visto", false, "chiusa")));
      }
      acts.appendChild(btn("✎ Rispondi", "ghost", () => {
        const t = prompt("Risposta per l'agente:", "");
        if (t && t.trim()) answerRequest(r, t.trim().slice(0, 1000));
      }));
      if (r.link) {
        acts.appendChild(btn("↗ Apri", "ghost", () => { window.open(r.link, "_blank", "noopener"); }));
      }
      card.appendChild(acts);
      wrap.appendChild(card);
    });
  }
  async function answerRequest(r, answer, applyDay, status) {
    if (applyDay) {
      const p = r.payload;
      const [y, m, d] = p.day.split("-").map(Number);
      if (!DATA.children.includes(p.child)) { toast("Figlio non trovato: " + p.child); return; }
      const entry = getEntry(y, m - 1, p.child);
      const before = cloneEntries();
      if (p.kind) entry[d] = p.kind; else delete entry[d];
      saveData();
      entriesChanged(before);
      rerenderApp();
    }
    const { error } = await sb.from("agent_requests")
      .update({ status: status || "risposta", answer, answered_at: new Date().toISOString() })
      .eq("id", r.id);
    if (error) { toast("⚠ Risposta non inviata: " + errMsg(error)); return; }
    toast("Risposta inviata all'agente");
    loadAgentRequests();
  }
  async function showAgentLog() {
    const list = $("agentLogList");
    list.textContent = "Caricamento…";
    const { data, error } = await sb.from("agent_log").select("at,routine,summary").order("at", { ascending: false }).limit(30);
    list.textContent = "";
    if (error) { list.textContent = errMsg(error); return; }
    if (!data.length) { list.textContent = "Nessun intervento registrato."; return; }
    data.forEach(r => {
      const row = el("div", "hist-row");
      row.appendChild(el("div", "hist-main", r.summary));
      row.appendChild(el("div", "hist-meta", `${swissDateTime(r.at)} · ${r.routine}`));
      list.appendChild(row);
    });
  }

  // ── link di sola lettura ──────────────────────────────────────────────
  function shareUrl(token) { return (CFG.appUrl || location.origin + location.pathname) + "#view=" + token; }
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast("Link copiato"); }
    catch (_) { prompt("Copia il link:", text); }
  }
  async function shareLink(url, label) {
    if (navigator.share) {
      try { await navigator.share({ title: label || "Calendario diritti di visita (sola lettura)", url }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    copyText(url);
  }
  async function createShareLink() {
    const days = parseInt($("shareDays").value, 10) || 30;
    const label = ($("shareLabel").value || "").trim().slice(0, 80) || null;
    const from = $("shareFrom").value || null;
    const to = $("shareTo").value || null;
    if (from && to && from > to) { setMsg("Il periodo non è valido: «dal» è dopo «al».", true); return; }
    const expires = new Date(Date.now() + days * 86400000).toISOString();
    const { data, error } = await sb.from("share_links")
      .insert({ user_id: user.id, label, date_from: from, date_to: to, expires_at: expires })
      .select("token")
      .single();
    if (error) { setMsg(errMsg(error), true); return; }
    setMsg("Link creato. Valido fino al " + swissDateTime(expires) + ".");
    $("shareLabel").value = "";
    await renderShareLinks();
    shareLink(shareUrl(data.token), label);
  }
  async function revokeShareLink(token) {
    if (!confirm("Revocare questo link? Chi lo ha ricevuto non potrà più vedere il calendario.")) return;
    const { error } = await sb.from("share_links").update({ revoked_at: new Date().toISOString() }).eq("token", token);
    if (error) { setMsg(errMsg(error), true); return; }
    toast("Link revocato");
    renderShareLinks();
  }
  async function renderShareLinks() {
    const list = $("shareList");
    if (!list) return;
    list.textContent = "";
    const { data, error } = await sb.from("share_links")
      .select("token,label,date_from,date_to,expires_at,revoked_at,use_count,last_used_at,created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) { list.textContent = errMsg(error); return; }
    if (!data.length) { list.textContent = "Nessun link creato."; return; }
    const now = Date.now();
    data.forEach(r => {
      const active = !r.revoked_at && new Date(r.expires_at).getTime() > now;
      const row = el("div", "share-row" + (active ? "" : " inactive"));
      const period = r.date_from || r.date_to ? ` · periodo ${swissDate(r.date_from) || "inizio"} – ${swissDate(r.date_to) || "oggi"}` : " · tutto il calendario";
      row.appendChild(el("div", "hist-main", (r.label || "Senza nome") + period));
      const st = r.revoked_at ? "revocato il " + swissDateTime(r.revoked_at)
        : active ? "attivo fino al " + swissDateTime(r.expires_at) : "scaduto il " + swissDateTime(r.expires_at);
      row.appendChild(el("div", "hist-meta", `${st} · aperto ${r.use_count} volte${r.last_used_at ? ", ultima " + swissDateTime(r.last_used_at) : ""}`));
      if (active) {
        const acts = el("div", "share-actions");
        acts.appendChild(btn("📤 Invia", "ghost", () => shareLink(shareUrl(r.token), r.label)));
        acts.appendChild(btn("📋 Copia", "ghost", () => copyText(shareUrl(r.token))));
        acts.appendChild(btn("⛔ Revoca", "ghost", () => revokeShareLink(r.token)));
        row.appendChild(acts);
      }
      list.appendChild(row);
    });
  }

  function wirePanel() {
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener("click", (ev) => { ev.preventDefault(); fn(); }); };
    const form = $("syncAuth");
    if (form) form.addEventListener("submit", (ev) => { ev.preventDefault(); doSignIn(); });
    on("syncPwToggle", () => {
      const i = $("syncPassword");
      i.type = i.type === "password" ? "text" : "password";
    });
    on("syncSignUp", doSignUp);
    on("syncSignOut", doSignOut);
    on("syncForgot", doForgot);
    on("pwResetSave", doResetSave);
    on("syncNow", () => { setMsg(""); sync(); });
    on("historyBtn", () => { const box = $("historyBox"); box.hidden = !box.hidden; if (!box.hidden) showHistory(); });
    on("shareCreate", createShareLink);
    on("agentLogBtn", () => { const box = $("agentLogBox"); box.hidden = !box.hidden; if (!box.hidden) showAgentLog(); });
    on("shareToggle", () => { const box = $("shareBox"); box.hidden = !box.hidden; if (!box.hidden) renderShareLinks(); });
    const badge = $("syncBadge");
    if (badge) badge.addEventListener("click", () => {
      openModal("settingsModal");
      const p = $("syncPanel");
      if (p) setTimeout(() => p.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
    });
  }

  // ── vista in sola lettura (#view=<token>) ─────────────────────────────
  async function startReadonly(token) {
    document.body.classList.add("readonly");
    const banner = $("roBanner");
    banner.hidden = false;
    banner.textContent = "🔒 Sola lettura · caricamento del calendario…";
    syncState = "readonly";
    if (!CFG || !window.supabase) { banner.textContent = "Vista in sola lettura non disponibile."; return; }
    const ro = window.supabase.createClient(CFG.url, CFG.key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data, error } = await ro.rpc("get_shared_calendar", { p_token: token });
    if (error || !data) {
      banner.textContent = /non valido|scaduto|revocato/i.test(error && error.message || "")
        ? "⛔ Questo link non è valido, è scaduto oppure è stato revocato."
        : "⚠ Impossibile caricare il calendario: " + errMsg(error);
      banner.classList.add("err");
      document.body.classList.add("ro-error");
      return;
    }
    const entries = {};
    const names = [];
    (Array.isArray(data.children) ? data.children : []).forEach(c => {
      if (typeof c === "string" && c && names.length < 20 && !names.includes(c)) names.push(c.slice(0, 60));
    });
    (Array.isArray(data.visits) ? data.visits : []).forEach(v => {
      if (!v || typeof v.child !== "string") return;
      if (!names.includes(v.child) && names.length < 20) names.push(v.child);
      setInEntries(entries, v.child, v.day, v.kind);
    });
    DATA.children = names.length ? names : ["—"];
    DATA.entries = entries;
    DATA.notes = {};
    (Array.isArray(data.notes) ? data.notes : []).forEach(n => {
      if (n && typeof n.day === "string" && typeof n.note === "string") DATA.notes[n.day.slice(0, 10)] = n.note.slice(0, 500);
    });
    activeChild = DATA.children[0];
    if (data.date_to) {
      const end = new Date(data.date_to + "T12:00:00");
      if (end < new Date()) { curYear = end.getFullYear(); curMonth = end.getMonth(); }
    }
    const parts = ["🔒 Sola lettura"];
    if (data.label) parts.push(data.label);
    if (data.date_from || data.date_to) parts.push(`periodo ${swissDate(data.date_from) || "inizio"} – ${swissDate(data.date_to) || "oggi"}`);
    parts.push("dati al " + swissDateTime(data.generated_at));
    parts.push("link valido fino al " + swissDate(data.expires_at));
    banner.textContent = parts.join(" · ");
    renderCalendar();
  }

  // ── avvio ─────────────────────────────────────────────────────────────
  async function init() {
    if (typeof READONLY_TOKEN !== "undefined" && READONLY_TOKEN) { startReadonly(READONLY_TOKEN); return; }
    wirePanel();
    if (!CFG || !window.supabase) { updateBadge(); renderSyncPanel(); return; }
    const fromEmail = /[#&](access_token|error_description)=/.test(location.hash);
    const emailError = fromEmail && (location.hash.match(/error_description=([^&]+)/) || [])[1];
    sb = window.supabase.createClient(CFG.url, CFG.key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: fromEmail, flowType: "implicit", storageKey: "diritti_visita_auth" },
    });
    if (fromEmail) {
      if (emailError) setTimeout(() => { openModal("settingsModal"); setMsg("Link dell'e-mail non valido o scaduto: " + decodeURIComponent(emailError.replace(/\+/g, " ")), true); }, 300);
    }
    sb.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setTimeout(showPasswordReset, 200);
      user = session ? session.user : null;
      updateBadge(); renderSyncPanel();
      if (user) scheduleSync(50);
    });
    try {
      const { data } = await sb.auth.getSession();
      user = data && data.session ? data.session.user : null;
    } catch (_) { user = null; }
    // la libreria ha letto i token dell'e-mail: si tolgono dall'indirizzo e dalla cronologia
    if (fromEmail) { try { history.replaceState(history.state, "", location.pathname + location.search); } catch (_) {} }
    updateBadge(); renderSyncPanel();
    if (user) scheduleSync(0);

    window.addEventListener("online", () => scheduleSync(200));
    window.addEventListener("offline", () => { if (user) setState("offline"); });
    document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && user) scheduleSync(100); });
    setInterval(() => { if (user && document.visibilityState === "visible") sync(); }, PULL_INTERVAL_MS);
  }

  window.CloudSync = Object.freeze({
    dayChanged, entriesChanged, notesChanged, settingsChanged,
    syncNow: () => sync(),
    status: () => ({ state: syncState, pending: pendingCount(), user: user ? user.email : null, lastSync: state.lastSync || null, error: lastError }),
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
