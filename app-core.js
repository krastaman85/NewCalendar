// ══════════════════════════════════════════════════════════════════════
// STATO E PERSISTENZA (localStorage)
// ══════════════════════════════════════════════════════════════════════
const STORAGE_KEY = "diritti_visita_data_v1";
// Chiavi mai accettate da dati esterni (anti prototype-pollution).
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

// Vista in sola lettura: l'app è aperta da un link "#view=<token>". In questa
// modalità non si legge né si scrive nulla nel localStorage del dispositivo:
// i dati arrivano dal link (vedi app-sync.js) e il calendario non è modificabile.
const READONLY_TOKEN = (location.hash.match(/^#view=([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i) || [])[1] || null;

// Notifica alla sincronizzazione cloud (app-sync.js), se presente.
function syncHook(name, ...args) {
  try {
    if (window.CloudSync && typeof window.CloudSync[name] === "function") window.CloudSync[name](...args);
  } catch (e) { /* la sincronizzazione non deve mai bloccare l'app */ }
}
function cloneEntries() { return JSON.parse(JSON.stringify(DATA.entries || {})); }
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const GG = ["L","M","M","G","V","S","D"];

function defaultData() {
  return {
    profile: { richiedente: "", domicilio: "", funzionario: "Persona 1" },
    children: ["Figlio 1", "Figlio 2"],
    birthdates: {},   // { "Nome figlio": "aaaa-mm-gg" }  (ISO per <input type=date>)
    entries: {},
    notes: {},        // { "aaaa-mm-gg": "testo" }  note del giorno (valgono per tutti i figli)
    schedule: defaultSchedule(),
    comboMode: false,
  };
}

// Schema ricorrente concordato. Settimana A = settimana del weekend col padre,
// settimana B = l'altra. Indici 0..6 = lunedì..domenica; valori "pern", "sing" o "".
// Valori iniziali = schema in prova dal 16.11.2026 (modificabile nelle Impostazioni).
function defaultSchedule() {
  return {
    ref: "2026-11-16",
    A: ["pern", "sing", "", "", "pern", "pern", "sing"],
    B: ["", "", "pern", "sing", "", "", ""],
  };
}
function sanitizeSchedule(sc) {
  const def = defaultSchedule();
  if (!sc || typeof sc !== "object") return def;
  const row = (r, d) => Array.isArray(r) && r.length === 7 ? r.map(v => (v === "pern" || v === "sing") ? v : "") : d;
  return {
    ref: typeof sc.ref === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sc.ref) ? sc.ref : def.ref,
    A: row(sc.A, def.A),
    B: row(sc.B, def.B),
  };
}
function sanitizeNotes(n) {
  const out = {};
  if (!n || typeof n !== "object") return out;
  Object.keys(n).forEach(k => {
    if (DANGEROUS_KEYS.has(k) || !/^\d{4}-\d{2}-\d{2}$/.test(k)) return;
    const t = typeof n[k] === "string" ? n[k].trim().slice(0, 500) : "";
    if (t) out[k] = t;
  });
  return out;
}

// Converte una data ISO (aaaa-mm-gg) nel formato svizzero gg.mm.aaaa usato dal
// modulo ufficiale. Ritorna "" se il valore non è una data ISO valida.
function isoToSwissDate(iso) {
  if (typeof iso !== "string") return "";
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  return `${m[3]}.${m[2]}.${m[1]}`;
}

let DATA = loadData();
let curYear = new Date().getFullYear();
let curMonth = new Date().getMonth();
let activeChild = DATA.children[0] || "";
let comboMode = !!DATA.comboMode;

function loadData() {
  if (READONLY_TOKEN) return Object.assign(defaultData(), { children: [] });
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = Object.assign(defaultData(), JSON.parse(raw));
    parsed.profile = Object.assign(defaultData().profile, parsed.profile && typeof parsed.profile === "object" ? parsed.profile : {});
    if (parsed.profile && typeof parsed.profile === "object") {
      parsed.profile.domicilio = String(parsed.profile.domicilio || "").trim();
    }
    if (!parsed.birthdates || typeof parsed.birthdates !== "object") parsed.birthdates = {};
    parsed.notes = sanitizeNotes(parsed.notes);
    parsed.schedule = sanitizeSchedule(parsed.schedule);
    return parsed;
  } catch (e) {
    // Dati illeggibili: se ne conserva una copia grezza prima di ripartire da zero,
    // così un errore non cancella mai definitivamente il calendario.
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) localStorage.setItem(STORAGE_KEY + "_illeggibile_" + Date.now(), raw);
    } catch (_) {}
    return defaultData();
  }
}
function saveData() {
  if (READONLY_TOKEN) return;
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA)); }
  catch (e) { toast("⚠ Memoria del dispositivo piena: dati non salvati"); }
}

function formatItalianDate(date = new Date()) {
  return new Intl.DateTimeFormat("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

function updateImportStatus(fileName) {
  const statusEl = document.getElementById("fileStatus");
  if (!statusEl) return;
  statusEl.textContent = fileName ? `File selezionato: ${fileName}` : "Nessun file caricato";
}

function percentOf(part, total) {
  if (!total) return 0;
  return Math.round((part / total) * 100);
}

function monthKey(y, m) { return `${y}-${String(m+1).padStart(2,"0")}`; }
function getEntry(y, m, child) {
  const key = monthKey(y, m);
  if (!DATA.entries[key]) DATA.entries[key] = {};
  if (!DATA.entries[key][child]) DATA.entries[key][child] = {};
  return DATA.entries[key][child];
}

// ══════════════════════════════════════════════════════════════════════
// COLORI PER FIGLIO — Figlio 1 verde, Figlio 2 turchese, altri figli su palette
// accento rotante (viola, arancio, rosso...) cosi' l'app resta pronta
// se in futuro si aggiungono altri figli.
// ══════════════════════════════════════════════════════════════════════
const EXTRA_PALETTE = ["#2f7fff", "#f9a825", "#ff5c7a", "#a78bfa", "#e879f9"];
function getChildColor(name) {
  const n = (name || "").trim().toLowerCase();
  const childIndex = DATA.children.indexOf(name);
  if (childIndex === 0) return { solid: "var(--child-first)", css: "c-first", hex: "#22c55e", deep: "var(--child-first-deep)" };
  if (childIndex === 1) return { solid: "var(--child-second)", css: "c-second", hex: "#14b8a6", deep: "var(--child-second-deep)" };
  // colore stabile per nome (hash semplice) tra gli altri figli eventuali
  let hash = 0;
  for (let i = 0; i < n.length; i++) hash = (hash * 31 + n.charCodeAt(i)) >>> 0;
  const hex = EXTRA_PALETTE[hash % EXTRA_PALETTE.length];
  return { solid: hex, css: "c-other", hex, deep: "#1a1a2e" };
}

function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 2200);
}

// ══════════════════════════════════════════════════════════════════════
// SICUREZZA: escaping di ogni stringa controllata dall'utente (nomi figli,
// dati di profilo) prima di inserirla via innerHTML. Senza questo, un nome
// contenente `"` o `<script>` — inserito a mano o tramite un file di
// backup manomesso — potrebbe eseguire codice arbitrario nella pagina.
// ══════════════════════════════════════════════════════════════════════
function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, ch => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[ch]));
}

// ══════════════════════════════════════════════════════════════════════
// TABS
// ══════════════════════════════════════════════════════════════════════
function currentTab() {
  const t = document.querySelector(".tab.active");
  return t ? t.dataset.tab : "calendar";
}
function showTab(name) {
  const t = document.querySelector(`.tab[data-tab="${name}"]`);
  const panel = document.getElementById("panel-" + name);
  if (!t || !panel) return;
  document.querySelectorAll(".tab").forEach(x => { x.classList.remove("active"); x.setAttribute("aria-selected", "false"); });
  document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
  t.classList.add("active");
  t.setAttribute("aria-selected", "true");
  panel.classList.add("active");
  if (name === "summary") renderYearSummary();
  if (name === "generate") renderGenerateList();
}
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    if (t.dataset.tab === currentTab()) return;
    showTab(t.dataset.tab);
    Nav.record();
  });
});

// ══════════════════════════════════════════════════════════════════════
// NAVIGAZIONE INDIETRO / AVANTI
// Ogni cambio di schermata (scheda, apertura/chiusura Impostazioni) viene
// registrato nella cronologia del browser: funzionano i pulsanti ‹ › in alto,
// il tasto/gesto Indietro di Android e Alt+← / Alt+→ da tastiera.
// ══════════════════════════════════════════════════════════════════════
const Nav = (() => {
  const stack = [];
  let idx = -1;
  let applying = false;
  const modalOpen = () => {
    const m = document.getElementById("settingsModal");
    return !!(m && m.classList.contains("show"));
  };
  const snapshot = () => ({ tab: currentTab(), modal: modalOpen() });
  const same = (a, b) => !!a && !!b && a.tab === b.tab && a.modal === b.modal;
  function updateButtons() {
    const back = document.getElementById("navBack");
    const fwd = document.getElementById("navFwd");
    if (back) back.disabled = idx <= 0;
    if (fwd) fwd.disabled = idx >= stack.length - 1;
  }
  function record() {
    if (applying || idx < 0) return;
    const s = snapshot();
    if (same(s, stack[idx])) return;
    stack.length = idx + 1;
    stack.push(s);
    idx = stack.length - 1;
    try { history.pushState({ navIdx: idx }, ""); } catch (e) {}
    updateButtons();
  }
  function apply(s) {
    applying = true;
    try {
      if (s.tab !== currentTab()) showTab(s.tab);
      if (s.modal && !modalOpen()) openModal("settingsModal");
      if (!s.modal && modalOpen()) closeModal("settingsModal");
    } finally { applying = false; }
  }
  window.addEventListener("popstate", (e) => {
    const i = e.state && typeof e.state.navIdx === "number" ? e.state.navIdx : 0;
    if (i < 0 || i >= stack.length) return;
    idx = i;
    apply(stack[idx]);
    updateButtons();
  });
  function init() {
    stack.length = 0;
    stack.push(snapshot());
    idx = 0;
    try { history.replaceState({ navIdx: 0 }, ""); } catch (e) {}
    updateButtons();
    const back = document.getElementById("navBack");
    const fwd = document.getElementById("navFwd");
    if (back) back.addEventListener("click", () => { if (idx > 0) history.back(); });
    if (fwd) fwd.addEventListener("click", () => { if (idx < stack.length - 1) history.forward(); });
  }
  return { record, init };
})();

// Scorciatoie da tastiera: ← / → cambiano mese (o anno nel Riepilogo).
document.addEventListener("keydown", (e) => {
  if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  const tag = (e.target && e.target.tagName) || "";
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(tag) || (e.target && e.target.isContentEditable)) return;
  const m = document.getElementById("settingsModal");
  if (m && m.classList.contains("show")) return;
  const delta = e.key === "ArrowLeft" ? -1 : 1;
  if (currentTab() === "summary") changeYear(delta); else changeMonth(delta);
  e.preventDefault();
});

function goToToday() {
  const t = new Date();
  curYear = t.getFullYear();
  curMonth = t.getMonth();
  renderCalendar();
  invalidateGenerated();
  if (currentTab() === "summary") renderYearSummary();
}

// ══════════════════════════════════════════════════════════════════════
// SELETTORE FIGLIO — segmented control colorato
// ══════════════════════════════════════════════════════════════════════
function renderChildSeg(containerId, onSelect) {
  const row = document.getElementById(containerId);
  row.innerHTML = "";
  DATA.children.forEach(c => {
    const col = getChildColor(c);
    const btn = document.createElement("button");
    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = c === activeChild ? "#fff" : col.hex;
    btn.className = "child-seg-btn" + (c === activeChild ? " active " + col.css : "");
    btn.appendChild(dot);
    const label = document.createElement("span");
    label.textContent = c;
    btn.appendChild(label);
    btn.onclick = () => { activeChild = c; onSelect(); };
    row.appendChild(btn);
  });
}

// ══════════════════════════════════════════════════════════════════════
// VISTA COMBINATA (toggle)
// ══════════════════════════════════════════════════════════════════════
function toggleCombo() {
  comboMode = !comboMode;
  DATA.comboMode = comboMode;
  saveData();
  document.getElementById("comboBtn").classList.toggle("on", comboMode);
  renderCalendar();
}

// ══════════════════════════════════════════════════════════════════════
// CALENDARIO
// ══════════════════════════════════════════════════════════════════════
function daysInMonth(y, m) { return new Date(y, m+1, 0).getDate(); }
function firstWeekday(y, m) { const d = new Date(y, m, 1).getDay(); return (d+6)%7; }

function renderLegend() {
  const el = document.getElementById("legendArea");
  el.innerHTML = "";

  const addLegendItem = (label, color, opacity, border) => {
    const item = document.createElement("span");
    const swatch = document.createElement("span");
    swatch.className = "sw";
    swatch.style.background = color;
    if (opacity !== undefined) swatch.style.opacity = opacity;
    if (border) swatch.style.border = border;
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(label));
    el.appendChild(item);
  };

  if (comboMode) {
    DATA.children.forEach(c => {
      const col = getChildColor(c);
      addLegendItem(c, col.hex);
    });
  } else {
    const col = getChildColor(activeChild);
    addLegendItem("Pernottamento", col.hex);
    addLegendItem("Giorno singolo", col.hex, "0.4");
    addLegendItem("Nessuna visita", "var(--surface)", undefined, "1px solid var(--border)");
  }
}

function renderCalendar(popDay) {
  renderChildSeg("childSegCal", () => renderCalendar());
  document.getElementById("comboBtn").classList.toggle("on", comboMode);
  document.getElementById("monthLabel").textContent = `${MESI[curMonth]} ${curYear}`;
  document.getElementById("monthLabelGen").textContent = `${MESI[curMonth]} ${curYear}`;

  const grid = document.getElementById("calGrid");
  grid.innerHTML = "";
  GG.forEach(g => { const el = document.createElement("div"); el.className="wd"; el.textContent=g; grid.appendChild(el); });

  const dim = daysInMonth(curYear, curMonth);
  const start = firstWeekday(curYear, curMonth);
  const today = new Date();
  const isCurMonth = today.getFullYear()===curYear && today.getMonth()===curMonth;

  for (let i = 0; i < start; i++) {
    const el = document.createElement("div"); el.className = "daycell empty"; grid.appendChild(el);
  }

  for (let d = 1; d <= dim; d++) {
    const el = document.createElement("div");
    const isToday = isCurMonth && d === today.getDate();
    attachDayHandlers(el, d);

    if (comboMode) {
      el.className = "daycell combo" + (isToday ? " today" : "");
      const nChildren = DATA.children.length;
      DATA.children.forEach((c, idx) => {
        const entry = getEntry(curYear, curMonth, c);
        const state = entry[d] || "";
        const col = getChildColor(c);
        const half = document.createElement("div");
        half.className = "half" + (state === "pern" ? " on" : state === "sing" ? " sing on" : "");
        half.style.background = col.hex;
        half.style.left = `${(idx / nChildren) * 100}%`;
        half.style.width = `${100 / nChildren}%`;
        if (state) {
          const init = document.createElement("span");
          init.className = "init";
          init.textContent = (c || "?").charAt(0).toUpperCase();
          half.appendChild(init);
        }
        el.appendChild(half);
      });
      const num = document.createElement("span");
      num.className = "num"; num.textContent = d;
      el.appendChild(num);
    } else {
      const entry = getEntry(curYear, curMonth, activeChild);
      const state = entry[d] || "";
      const col = getChildColor(activeChild);
      el.className = "daycell" + (state ? " " + state : "") + (isToday ? " today" : "");
      el.dataset.child = DATA.children.indexOf(activeChild) === 1 ? "second" : "";
      if (state === "pern") { el.style.background = col.hex; el.style.borderColor = col.hex; el.style.color = col.deep; }
      else if (state === "sing") { el.style.background = col.hex + "55"; el.style.borderColor = col.hex; el.style.color = "var(--text)"; }
      el.textContent = d;
    }
    if (d === popDay) el.classList.add("daycell-pop");
    const iso = `${curYear}-${String(curMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const note = (DATA.notes || {})[iso];
    if (note) { el.classList.add("has-note"); el.title = note; }
    el.setAttribute("role", "button");
    el.tabIndex = 0;
    el.setAttribute("aria-label", dayAriaLabel(d, note));
    grid.appendChild(el);
  }
  renderLegend();
  updateStats();
  if (typeof renderNotesList === "function") renderNotesList();
}

const KIND_LABEL = { pern: "pernottamento", sing: "giorno singolo" };
function dayAriaLabel(d, note) {
  const base = `${d} ${MESI[curMonth].toLowerCase()} ${curYear}`;
  const who = comboMode ? DATA.children : [activeChild];
  const parts = who.map(c => `${c}: ${KIND_LABEL[getEntry(curYear, curMonth, c)[d]] || "nessuna visita"}`);
  return `${base}. ${parts.join(", ")}${note ? ". Nota: " + note : ""}`;
}

// Tocco = cambia stato (o apre la nota in modalità Note); pressione lunga = nota.
// Da tastiera: Invio/Spazio come il tocco, N per la nota.
let notesMode = false;
function attachDayHandlers(el, d) {
  let timer = null, longDone = false, sx = 0, sy = 0;
  const openNote = () => { if (typeof openNoteEditor === "function") openNoteEditor(d); };
  el.addEventListener("click", () => {
    if (longDone) { longDone = false; return; }
    if (notesMode || READONLY_TOKEN) { if (!READONLY_TOKEN) openNote(); return; }
    cycleDay(d);
  });
  el.addEventListener("pointerdown", (e) => {
    longDone = false; sx = e.clientX; sy = e.clientY;
    if (READONLY_TOKEN) return;
    timer = setTimeout(() => { longDone = true; timer = null; if (navigator.vibrate) navigator.vibrate(15); openNote(); }, 550);
  });
  const cancel = () => { if (timer) { clearTimeout(timer); timer = null; } };
  el.addEventListener("pointerup", cancel);
  el.addEventListener("pointerleave", cancel);
  el.addEventListener("pointercancel", cancel);
  el.addEventListener("pointermove", (e) => { if (Math.abs(e.clientX - sx) > 10 || Math.abs(e.clientY - sy) > 10) cancel(); });
  el.addEventListener("contextmenu", (e) => e.preventDefault());
  el.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); el.click(); }
    else if ((e.key === "n" || e.key === "N") && !READONLY_TOKEN) { e.preventDefault(); openNote(); }
  });
}

function cycleDay(d) {
  if (READONLY_TOKEN) return;
  const entry = getEntry(curYear, curMonth, activeChild);
  const cur = entry[d] || "";
  const next = cur === "" ? "pern" : cur === "pern" ? "sing" : "";
  if (typeof pushUndo === "function") pushUndo(`${activeChild}, ${d} ${MESI[curMonth].toLowerCase()}: ${KIND_LABEL[next] || "nessuna visita"}`);
  if (next === "") delete entry[d]; else entry[d] = next;
  saveData();
  syncHook("dayChanged", activeChild, curYear, curMonth, d, next || null);
  renderCalendar(d);
  invalidateGenerated();
}

// ── KPI a riga singola con transizioni di entrata/uscita ────────────────
// updateStats costruisce la lista desiderata di KPI (con una CHIAVE stabile
// per ciascuno) e la riconcilia con le card già presenti: quelle che restano
// vengono aggiornate sul posto, quelle nuove entrano e quelle non più
// necessarie escono, sempre con effetti fluidi e su una sola riga.
function prefersReducedMotion() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function updateStats() {
  const bar = document.getElementById("statsBar");
  const dim = daysInMonth(curYear, curMonth);

  let items;
  if (comboMode) {
    items = DATA.children.map(c => {
      const tot = Object.values(getEntry(curYear, curMonth, c)).length;
      const col = getChildColor(c);
      return { key: "child:" + c, cls: col.css, n: tot, l: c, pct: percentOf(tot, dim) };
    });
  } else {
    const vals = Object.values(getEntry(curYear, curMonth, activeChild));
    const pern = vals.filter(v => v === "pern").length;
    const sing = vals.filter(v => v === "sing").length;
    const tot = pern + sing;
    const col = getChildColor(activeChild);
    items = [
      { key: "tot",  cls: col.css, n: tot,  l: "giorni",   pct: percentOf(tot, dim) },
      { key: "pern", cls: col.css, n: pern, l: "pernott.", pct: percentOf(pern, dim) },
      { key: "sing", cls: col.css, n: sing, l: "singoli",  pct: percentOf(sing, dim) },
    ];
  }
  reconcileStats(bar, items);
}

function buildStatCard(it) {
  const card = document.createElement("div");
  card.className = "statcard " + it.cls;
  card.dataset.key = it.key;
  const n = document.createElement("div"); n.className = "n"; n.textContent = it.n;
  const l = document.createElement("div"); l.className = "l"; l.textContent = it.l;
  const p = document.createElement("div"); p.className = "pct"; p.textContent = it.pct + "%";
  card.append(n, l, p);
  return card;
}

function updateStatCard(el, it) {
  el.className = "statcard " + it.cls;
  el.dataset.key = it.key;
  const nEl = el.querySelector(".n");
  const changed = nEl.textContent !== String(it.n);
  nEl.textContent = it.n;
  el.querySelector(".l").textContent = it.l;
  el.querySelector(".pct").textContent = it.pct + "%";
  if (changed && !prefersReducedMotion()) {
    el.classList.remove("stat-pulse"); void el.offsetWidth; el.classList.add("stat-pulse");
  }
}

function enterStatCard(el) {
  if (prefersReducedMotion()) return;
  el.classList.add("stat-enter");
  el.style.maxWidth = "0px";
  el.style.flexGrow = "0";
  requestAnimationFrame(() => requestAnimationFrame(() => {
    el.classList.remove("stat-enter");
    el.style.maxWidth = "280px";
    el.style.flexGrow = "1";
    const clear = () => { el.style.maxWidth = ""; };
    el.addEventListener("transitionend", clear, { once: true });
    setTimeout(clear, 500);
  }));
}

function leaveStatCard(el) {
  el.dataset.leaving = "1";
  if (prefersReducedMotion()) { el.remove(); return; }
  el.style.maxWidth = el.offsetWidth + "px";
  void el.offsetWidth; // reflow per far partire la transizione
  el.classList.add("stat-leave");
  el.style.maxWidth = "0px";
  el.style.flexGrow = "0";
  const done = () => { if (el.parentNode) el.remove(); };
  el.addEventListener("transitionend", done, { once: true });
  setTimeout(done, 500);
}

function reconcileStats(bar, items) {
  const existing = new Map();
  bar.querySelectorAll(".statcard").forEach(el => {
    if (el.dataset.leaving === "1") return;
    existing.set(el.dataset.key, el);
  });
  const desired = new Set(items.map(it => it.key));

  // Uscita
  existing.forEach((el, key) => { if (!desired.has(key)) leaveStatCard(el); });

  // Entrata/aggiornamento nell'ordine desiderato
  let prev = null;
  items.forEach(it => {
    let el = existing.get(it.key);
    if (el) {
      updateStatCard(el, it);
    } else {
      el = buildStatCard(it);
      bar.appendChild(el);
      enterStatCard(el);
    }
    const anchor = prev ? prev.nextSibling : bar.firstChild;
    if (anchor !== el) bar.insertBefore(el, anchor);
    prev = el;
  });
}

function changeMonth(delta) {
  curMonth += delta;
  if (curMonth > 11) { curMonth = 0; curYear++; }
  if (curMonth < 0) { curMonth = 11; curYear--; }
  renderCalendar();
  invalidateGenerated();
}

// ── Navigazione a gesto (swipe orizzontale sul calendario) ──────────────
(function setupSwipe() {
  let startX = 0, startY = 0, tracking = false;
  const grid = document.getElementById("calGrid");
  grid.addEventListener("touchstart", (e) => {
    startX = e.touches[0].clientX; startY = e.touches[0].clientY; tracking = true;
  }, { passive: true });
  grid.addEventListener("touchend", (e) => {
    if (!tracking) return;
    tracking = false;
    const dx = e.changedTouches[0].clientX - startX;
    const dy = e.changedTouches[0].clientY - startY;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) {
      changeMonth(dx < 0 ? 1 : -1);
    }
  }, { passive: true });
})();

function copyFromPreviousMonth() {
  let py = curYear, pm = curMonth - 1;
  if (pm < 0) { pm = 11; py--; }
  const prevKey = monthKey(py, pm);
  const curKey = monthKey(curYear, curMonth);
  if (!DATA.entries[prevKey] || !DATA.entries[prevKey][activeChild]) { toast("Nessun dato nel mese precedente"); return; }
  const before = cloneEntries();
  if (typeof pushUndo === "function") pushUndo("Copia dal mese precedente");
  if (!DATA.entries[curKey]) DATA.entries[curKey] = {};
  // Si copiano solo i giorni che esistono anche nel mese corrente (es. il 31).
  const src = DATA.entries[prevKey][activeChild];
  const dim = daysInMonth(curYear, curMonth);
  const copy = {};
  Object.keys(src).forEach(k => { if (parseInt(k, 10) <= dim) copy[k] = src[k]; });
  DATA.entries[curKey][activeChild] = copy;
  saveData(); renderCalendar(); invalidateGenerated();
  syncHook("entriesChanged", before);
  toast("Copiato dal mese precedente");
}

function clearMonth() {
  if (!confirm(`Svuotare tutti i giorni di ${activeChild} per ${MESI[curMonth]} ${curYear}?`)) return;
  const before = cloneEntries();
  if (typeof pushUndo === "function") pushUndo("Mese svuotato");
  const key = monthKey(curYear, curMonth);
  if (DATA.entries[key]) delete DATA.entries[key][activeChild];
  saveData(); renderCalendar(); invalidateGenerated();
  syncHook("entriesChanged", before);
}

// ══════════════════════════════════════════════════════════════════════
// RIEPILOGO ANNUALE
// ══════════════════════════════════════════════════════════════════════
function renderYearSummary() {
  renderChildSeg("childSegSummary", () => renderYearSummary());
  document.getElementById("yearLabel").textContent = curYear;
  const table = document.getElementById("yearTable");
  const yearDays = new Date(curYear, 1, 29).getMonth() === 1 ? 366 : 365;
  let html = "<tr><th>Mese</th><th>Pernott.</th><th>Singoli</th><th>Totale</th></tr>";
  let totP=0, totS=0, totT=0;
  for (let m = 0; m < 12; m++) {
    const key = monthKey(curYear, m);
    const entry = (DATA.entries[key] && DATA.entries[key][activeChild]) || {};
    const vals = Object.values(entry);
    const pern = vals.filter(v=>v==="pern").length;
    const sing = vals.filter(v=>v==="sing").length;
    const tot = pern+sing;
    const monthDays = new Date(curYear, m + 1, 0).getDate();
    const pct = percentOf(tot, monthDays);
    totP+=pern; totS+=sing; totT+=tot;
    html += `<tr><td class="month">${MESI[m]}</td><td>${pern}</td><td>${sing}</td><td class="tot">${tot} <span class="pct-pill">${pct}%</span></td></tr>`;
  }
  const annualPct = percentOf(totT, yearDays);
  html += `<tr><td class="month">TOTALE ANNO</td><td>${totP}</td><td>${totS}</td><td class="tot">${totT} <span class="pct-pill">${annualPct}%</span></td></tr>`;
  table.innerHTML = html;
}
function changeYear(delta) { curYear += delta; renderYearSummary(); }

function printYearSummary() {
  if (typeof printReport === "function") printReport({ year: curYear, children: [activeChild], detail: false });
}

// ══════════════════════════════════════════════════════════════════════
// BACKUP / RIPRISTINO
// ══════════════════════════════════════════════════════════════════════
function exportBackup() {
  const blob = new Blob([JSON.stringify(DATA, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `backup_diritti_visita_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast("Backup scaricato");
}
const importInput = document.getElementById("importInput");
if (importInput) {
  updateImportStatus("");
  importInput.addEventListener("change", (e) => {
    const file = e.target.files[0];
    if (!file) {
      updateImportStatus("");
      return;
    }
    updateImportStatus(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const safe = sanitizeBackupData(parsed);
        if (!safe) {
          alert("File di backup non valido o corrotto.");
          updateImportStatus("");
          return;
        }
        if (!confirm("Questo sostituirà tutti i dati attuali con quelli del backup. Continuare?")) {
          updateImportStatus("");
          return;
        }
        const before = cloneEntries();
        DATA = safe;
        comboMode = !!DATA.comboMode;
        saveData();
        syncHook("entriesChanged", before);
        syncHook("settingsChanged");
        activeChild = DATA.children[0] || "";
        renderCalendar();
        invalidateGenerated();
        updateImportStatus("");
        toast("Backup ripristinato");
      } catch (err) {
        alert("File di backup non valido.");
        updateImportStatus("");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  });
}

// ══════════════════════════════════════════════════════════════════════
// SICUREZZA: valida in modo rigoroso un file di backup prima di caricarlo.
// Non ci si fida mai ciecamente di un JSON esterno: si ricostruisce un
// oggetto pulito campo per campo, scartando chiavi pericolose (es.
// "__proto__", "constructor") e qualunque valore fuori dai formati attesi.
// Questo impedisce sia l'inquinamento del prototipo sia l'introduzione di
// dati malformati che romperebbero il calendario.
// ══════════════════════════════════════════════════════════════════════
// (DANGEROUS_KEYS è definito in cima al file: serve già al caricamento dei dati)

function sanitizeBackupData(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const safe = defaultData();

  if (parsed.profile && typeof parsed.profile === "object") {
    ["richiedente", "domicilio", "funzionario"].forEach(k => {
      if (typeof parsed.profile[k] === "string") safe.profile[k] = parsed.profile[k].slice(0, 200);
    });
  }

  if (Array.isArray(parsed.children)) {
    const clean = parsed.children
      .filter(c => typeof c === "string" && !DANGEROUS_KEYS.has(c))
      .map(c => c.slice(0, 60))
      .filter(Boolean)
      .slice(0, 20); // limite ragionevole
    if (clean.length) safe.children = clean;
  }

  if (parsed.birthdates && typeof parsed.birthdates === "object") {
    const cleanBd = {};
    for (const name of Object.keys(parsed.birthdates)) {
      if (DANGEROUS_KEYS.has(name)) continue;
      const v = parsed.birthdates[name];
      if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
        cleanBd[name.slice(0, 60)] = v;
      }
    }
    safe.birthdates = cleanBd;
  }

  if (parsed.entries && typeof parsed.entries === "object") {
    const cleanEntries = {};
    for (const monthKey of Object.keys(parsed.entries)) {
      if (DANGEROUS_KEYS.has(monthKey) || !/^\d{4}-\d{2}$/.test(monthKey)) continue;
      const monthObj = parsed.entries[monthKey];
      if (!monthObj || typeof monthObj !== "object") continue;
      const cleanMonth = {};
      for (const childName of Object.keys(monthObj)) {
        if (DANGEROUS_KEYS.has(childName)) continue;
        const dayObj = monthObj[childName];
        if (!dayObj || typeof dayObj !== "object") continue;
        const cleanDays = {};
        for (const dayKey of Object.keys(dayObj)) {
          const dayNum = parseInt(dayKey, 10);
          const val = dayObj[dayKey];
          if (dayNum >= 1 && dayNum <= 31 && (val === "pern" || val === "sing")) {
            cleanDays[dayNum] = val;
          }
        }
        cleanMonth[childName.slice(0, 60)] = cleanDays;
      }
      cleanEntries[monthKey] = cleanMonth;
    }
    safe.entries = cleanEntries;
  }

  safe.notes = sanitizeNotes(parsed.notes);
  safe.schedule = sanitizeSchedule(parsed.schedule);
  safe.comboMode = !!parsed.comboMode;
  return safe;
}

// ══════════════════════════════════════════════════════════════════════
// IMPOSTAZIONI
// ══════════════════════════════════════════════════════════════════════
// Riempie il modulo Impostazioni con i dati attuali (anche quando la
// sincronizzazione porta impostazioni nuove mentre il modulo è aperto).
function refreshSettingsForm() {
  childDraft = DATA.children.map(c => ({ orig: c, name: c, bday: DATA.birthdates[c] || "" }));
  document.getElementById("setRichiedente").value = DATA.profile.richiedente;
  document.getElementById("setDomicilio").value = DATA.profile.domicilio;
  document.getElementById("setFunzionario").value = DATA.profile.funzionario;
  renderChildFields();
  if (typeof renderScheduleEditor === "function") renderScheduleEditor();
}
function openModal(id) {
  if (id === "settingsModal") refreshSettingsForm();
  document.getElementById(id).classList.add("show");
  Nav.record();
}
// Chiusura senza «Salva»: figli e schema restano com'erano, perché il modulo
// lavora su una bozza (childDraft, bozza dello schema) e non su DATA.
function closeModal(id) {
  document.getElementById(id).classList.remove("show");
  Nav.record();
}

let childDraft = [];   // [{ orig: nome originale | null, name, bday }]
function captureChildDraft() {
  document.querySelectorAll("#childList .childlist-item").forEach((row, i) => {
    if (!childDraft[i]) return;
    childDraft[i].name = row.querySelector(".child-name").value;
    childDraft[i].bday = row.querySelector(".child-bday").value;
  });
}
function renderChildFields() {
  const list = document.getElementById("childList");
  list.innerHTML = "";
  childDraft.forEach((item, i) => {
    const c = item.name;
    const col = getChildColor(item.orig || c);
    const row = document.createElement("div");
    row.className = "childlist-item";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = col.hex;
    row.appendChild(dot);

    const input = document.createElement("input");
    input.className = "child-name";
    input.value = c;
    input.dataset.idx = String(i);
    input.setAttribute("aria-label", `Nome del figlio ${i + 1}`);
    row.appendChild(input);

    const bday = document.createElement("input");
    bday.type = "date";
    bday.className = "child-bday";
    bday.value = item.bday || "";
    bday.dataset.idx = String(i);
    bday.setAttribute("aria-label", `Data di nascita del figlio ${i + 1}`);
    bday.title = "Data di nascita";
    row.appendChild(bday);

    const removeBtn = document.createElement("button");
    removeBtn.className = "rm";
    removeBtn.type = "button";
    removeBtn.setAttribute("aria-label", `Rimuovi figlio ${i + 1}`);
    removeBtn.dataset.action = "remove-child";
    removeBtn.dataset.index = String(i);
    removeBtn.textContent = "✕";
    row.appendChild(removeBtn);

    list.appendChild(row);
  });
}
function addChildField() { captureChildDraft(); childDraft.push({ orig: null, name: "Nuovo figlio", bday: "" }); renderChildFields(); }
function removeChildField(i) {
  captureChildDraft();
  if (childDraft.length <= 1) { alert("Deve restare almeno un figlio."); return; }
  childDraft.splice(i, 1); renderChildFields();
}
function saveSettings() {
  DATA.profile.richiedente = document.getElementById("setRichiedente").value.trim();
  DATA.profile.domicilio = document.getElementById("setDomicilio").value.trim();
  DATA.profile.funzionario = document.getElementById("setFunzionario").value.trim();

  // Leggo nome + data di nascita riga per riga (così un rinomino conserva la data)
  const rows = document.querySelectorAll("#childList .childlist-item");
  const children = [];
  const birthdates = {};
  const renames = [];
  rows.forEach(row => {
    const input = row.querySelector(".child-name");
    const name = (input?.value || "").trim().slice(0, 60);
    if (!name || DANGEROUS_KEYS.has(name) || children.includes(name)) return;
    const draft = childDraft[Number(input.dataset.idx)];
    const oldName = draft ? draft.orig : null;
    if (oldName && oldName !== name) renames.push([oldName, name]);
    children.push(name);
    const bday = (row.querySelector(".child-bday")?.value || "").trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(bday)) birthdates[name] = bday;
  });
  const before = cloneEntries();
  if (children.length) {
    // Rinomina: i giorni già segnati seguono il nuovo nome del figlio.
    renames.forEach(([oldName, newName]) => {
      if (DATA.children.includes(newName)) return; // nome già usato da un altro figlio
      Object.keys(DATA.entries).forEach(mk => {
        const month = DATA.entries[mk];
        if (month && month[oldName] && !month[newName]) { month[newName] = month[oldName]; delete month[oldName]; }
      });
    });
    DATA.children = children;
    DATA.birthdates = birthdates;
  }
  if (!DATA.children.includes(activeChild)) activeChild = DATA.children[0];
  if (typeof readScheduleEditor === "function") DATA.schedule = readScheduleEditor();
  saveData(); closeModal("settingsModal"); renderCalendar(); invalidateGenerated();
  syncHook("entriesChanged", before);
  syncHook("settingsChanged");
  toast("Impostazioni salvate");
}

// ══════════════════════════════════════════════════════════════════════
// GENERAZIONE MODULI PDF (pdf-lib, compila il modulo ufficiale AcroForm)
// ══════════════════════════════════════════════════════════════════════
async function getTemplatePdfBytes() {
  const candidates = [
    "./modulo-ufficiale.pdf",
    "./official-form.pdf",
    "./form-ufficiale.pdf",
    "./template.pdf",
    "./pdf/modulo-ufficiale.pdf"
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (response.ok) return new Uint8Array(await response.arrayBuffer());
    } catch (_) {}
  }

  throw new Error("Modulo ufficiale (modulo-ufficiale.pdf) non trovato: impossibile generare il PDF.");
}

function renderGenerateList() {
  const list = document.getElementById("generateList");
  list.innerHTML = "";
  DATA.children.forEach(child => {
    const entry = getEntry(curYear, curMonth, child);
    const tot = Object.keys(entry).length;
    const col = getChildColor(child);
    const row = document.createElement("div");
    row.className = "genrow";

    const left = document.createElement("div");
    left.className = "left";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = col.hex;
    left.appendChild(dot);

    const meta = document.createElement("div");
    const name = document.createElement("div");
    name.className = "name";
    name.textContent = child;
    const cnt = document.createElement("div");
    cnt.className = "cnt";
    cnt.textContent = `${tot} giorni segnati`;
    meta.appendChild(name);
    meta.appendChild(cnt);
    left.appendChild(meta);
    row.appendChild(left);

    const btn = document.createElement("button");
    btn.className = col.css;
    btn.textContent = generatedPdfs[child] ? "Rigenera" : "Genera";
    btn.onclick = () => generateSingleForm(child);
    row.appendChild(btn);

    const item = document.createElement("div");
    item.className = "genitem";
    item.appendChild(row);
    item.appendChild(buildShareActions(child));
    list.appendChild(item);
  });
}

// Rileva se il dispositivo può condividere FILE tramite il foglio di condivisione
// nativo (WhatsApp, Email, Salva su file, ecc.). Su desktop spesso non è supportato.
function canShareFiles() {
  try {
    if (!navigator.canShare) return false;
    const probe = new File([new Blob([""], { type: "application/pdf" })], "x.pdf", { type: "application/pdf" });
    return navigator.canShare({ files: [probe] });
  } catch (e) { return false; }
}

// Barra di azioni (Condividi / Scarica / Apri) mostrata dopo la generazione.
function buildShareActions(child) {
  const box = document.createElement("div");
  box.className = "genactions";
  if (!generatedPdfs[child]) return box;         // nascosta finché non si genera
  box.classList.add("show");

  const mk = (label, cls, handler) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "sharebtn" + (cls ? " " + cls : "");
    b.textContent = label;
    b.onclick = handler;
    return b;
  };

  if (canShareFiles()) {
    box.appendChild(mk("📤 Condividi / Invia", "primary", () => sharePdf([generatedPdfs[child]])));
  }
  box.appendChild(mk("⬇️ Scarica", "", () => { const g = generatedPdfs[child]; downloadPdf(g.bytes, g.filename); }));
  box.appendChild(mk("🔎 Apri / Stampa", "", () => openPdf(generatedPdfs[child].bytes)));

  if (canShareFiles()) {
    const note = document.createElement("div");
    note.className = "genactions-note";
    note.textContent = "Condividi apre WhatsApp, Email, Salva su file e altro.";
    box.appendChild(note);
  }
  return box;
}

async function fillFormPdf(child) {
  const { PDFDocument } = PDFLib;
  const bytes = await getTemplatePdfBytes();
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

  // NOTA: non rimuoviamo più gli XObject immagine. Il template usato è il
  // modulo ufficiale in bianco, che NON contiene firme scannerizzate ma solo
  // il logo del Cantone: eliminare gli XObject cancellava anche il logo.
  // Le firme restano comunque escluse perché i relativi campi di testo sono
  // filtrati da isBlockedFieldName qui sotto.

  const isBlockedFieldName = (name) => {
    const lower = String(name || "").toLowerCase();
    return /firma|signature|timbro|stampa|data firma|firma del/.test(lower);
  };

  const setIfExists = (name, value) => {
    if (!name || isBlockedFieldName(name)) return;
    try {
      const field = form.getTextField(name);
      const safeValue = value == null ? "" : String(value).trim();
      field.setText(safeValue);
    } catch (e) {}
  };

  const todayString = formatItalianDate(new Date());

  setIfExists("Funzionario incaricato", DATA.profile.funzionario);
  setIfExists("Cognome e nome", DATA.profile.richiedente);
  setIfExists("Domicilio", (DATA.profile.domicilio || "").trim());

  const cognomeBase = DATA.profile.richiedente.split(" ")[0] || "";
  // Se il nome del figlio contiene già il cognome (es. «Meryl Diasio») non lo si ripete.
  const hasSurname = cognomeBase && child.toLowerCase().split(/\s+/).includes(cognomeBase.toLowerCase());
  setIfExists("per figlio", hasSurname ? child : `${cognomeBase} ${child}`.trim());
  setIfExists("data di nascita", isoToSwissDate(DATA.birthdates[child]));
  // "per il mese" = mese di riferimento del calendario (es. "Agosto 2026"),
  // NON la data odierna. Gli altri eventuali campi data ricevono la data di oggi.
  setIfExists("per il mese", `${MESI[curMonth]} ${curYear}`);
  ["Data", "data", "Data odierna", "data odierna"].forEach(name => setIfExists(name, todayString));

  for (let d = 1; d <= 31; d++) {
    setIfExists(`Per notte con pernottamento${d}`, "");
    setIfExists(`Giorno singolo senza pernottamento${d}`, "");
  }

  const entry = getEntry(curYear, curMonth, child);
  Object.keys(entry).forEach(d => {
    if (entry[d] === "pern") setIfExists(`Per notte con pernottamento${d}`, "1");
    if (entry[d] === "sing") setIfExists(`Giorno singolo senza pernottamento${d}`, "1");
  });

  try { form.updateFieldAppearances(); } catch(e) {}

  // Alcuni visualizzatori (Anteprima di macOS, Quick Look su iPhone, alcune
  // versioni di Adobe) ignorano gli "appearance stream" generati da pdf-lib e
  // mostrerebbero il modulo VUOTO anche se i dati sono presenti. Impostando
  // NeedAppearances il visualizzatore rigenera l'aspetto dai valori dei campi.
  try {
    form.acroForm.dict.set(PDFLib.PDFName.of("NeedAppearances"), PDFLib.PDFBool.True);
  } catch (e) {}

  return await pdfDoc.save();
}

function pdfFilename(child) {
  const mese = MESI[curMonth].toLowerCase();
  return `diritti_di_visita_${mese}_${curYear}_${child}.pdf`;
}

// PDF generati nella sessione corrente: child -> { bytes, filename }.
// Restano disponibili per essere salvati/inviati in più modi finché i dati
// del mese non cambiano (allora vengono invalidati).
const generatedPdfs = {};

function pdfBlob(bytes) { return new Blob([bytes], { type: "application/pdf" }); }

function downloadPdf(bytes, filename) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(pdfBlob(bytes));
  a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 15000);
  toast("PDF scaricato");
}

function openPdf(bytes) {
  const url = URL.createObjectURL(pdfBlob(bytes));
  const w = window.open(url, "_blank");
  if (!w) toast("Consenti i popup per aprire il PDF");
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Condivisione tramite foglio nativo (WhatsApp, Email, Messaggi, Salva su file…).
// items: [{ bytes, filename }]. Fallback al download se non supportato.
async function sharePdf(items) {
  const files = items.map(it => new File([pdfBlob(it.bytes)], it.filename, { type: "application/pdf" }));
  try {
    if (navigator.canShare && navigator.canShare({ files })) {
      await navigator.share({ files, title: files.length > 1 ? "Moduli diritti di visita" : files[0].name });
      return;
    }
  } catch (e) {
    if (e && e.name === "AbortError") return;    // condivisione annullata dall'utente
  }
  items.forEach(it => downloadPdf(it.bytes, it.filename));
  toast("Condivisione non disponibile: file scaricato");
}

// Barra "condividi/scarica tutti" quando ci sono ≥2 moduli generati.
function updateGenAllActions() {
  const box = document.getElementById("genAllActions");
  if (!box) return;
  box.innerHTML = "";
  const ready = DATA.children.filter(c => generatedPdfs[c]).map(c => generatedPdfs[c]);
  if (ready.length < 2) { box.classList.remove("show"); return; }
  box.classList.add("show");
  const mk = (label, cls, h) => {
    const b = document.createElement("button");
    b.type = "button"; b.className = "sharebtn" + (cls ? " " + cls : ""); b.textContent = label; b.onclick = h;
    return b;
  };
  if (canShareFiles()) box.appendChild(mk("📤 Condividi tutti", "primary", () => sharePdf(ready)));
  box.appendChild(mk("⬇️ Scarica tutti", "", () => ready.forEach(g => downloadPdf(g.bytes, g.filename))));
}

// I PDF generati non riflettono più i dati se il mese/i giorni cambiano:
// li invalidiamo e nascondiamo le azioni.
function invalidateGenerated() {
  for (const k in generatedPdfs) delete generatedPdfs[k];
  const box = document.getElementById("genAllActions");
  if (box) { box.innerHTML = ""; box.classList.remove("show"); }
  const status = document.getElementById("genStatus");
  if (status) status.textContent = "";
  const panel = document.getElementById("panel-generate");
  if (panel && panel.classList.contains("active")) renderGenerateList();
}

async function generateSingleForm(child) {
  const status = document.getElementById("genStatus");
  status.textContent = `Generazione modulo ${child}…`;
  try {
    const bytes = await fillFormPdf(child);
    generatedPdfs[child] = { bytes, filename: pdfFilename(child) };
    renderGenerateList();
    updateGenAllActions();
    status.textContent = `✓ Modulo ${child} pronto: scegli come salvarlo o inviarlo.`;
  } catch (e) { status.textContent = "Errore: " + e.message; }
}

async function generateAllForms() {
  const status = document.getElementById("genStatus");
  status.textContent = "Generazione in corso…";
  try {
    for (const child of DATA.children) {
      generatedPdfs[child] = { bytes: await fillFormPdf(child), filename: pdfFilename(child) };
    }
  } catch (e) { status.textContent = "Errore: " + e.message; return; }
  renderGenerateList();
  updateGenAllActions();
  status.textContent = `✓ ${DATA.children.length} moduli pronti per ${MESI[curMonth]} ${curYear}: salvali o inviali qui sotto.`;
}

// ══════════════════════════════════════════════════════════════════════
// AVVIO
// ══════════════════════════════════════════════════════════════════════
document.getElementById("comboBtn").classList.toggle("on", comboMode);
renderCalendar();
Nav.init();
{
  const tb = document.getElementById("todayBtn");
  if (tb) tb.addEventListener("click", goToToday);
}
