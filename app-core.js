// ══════════════════════════════════════════════════════════════════════
// STATO E PERSISTENZA (localStorage)
// ══════════════════════════════════════════════════════════════════════
const STORAGE_KEY = "diritti_visita_data_v1";
const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const GG = ["L","M","M","G","V","S","D"];

function defaultData() {
  return {
    profile: { richiedente: "", domicilio: "", funzionario: "Persona 1" },
    children: ["Figlio 1", "Figlio 2"],
    entries: {},
    comboMode: false,
  };
}

let DATA = loadData();
let curYear = new Date().getFullYear();
let curMonth = new Date().getMonth();
let activeChild = DATA.children[0] || "";
let comboMode = !!DATA.comboMode;

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultData();
    const parsed = Object.assign(defaultData(), JSON.parse(raw));
    if (parsed.profile && typeof parsed.profile === "object") {
      parsed.profile.domicilio = String(parsed.profile.domicilio || "").trim();
      if (parsed.profile.domicilio.toLowerCase() === "agno") parsed.profile.domicilio = "";
    }
    return parsed;
  } catch (e) { return defaultData(); }
}
function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(DATA)); }

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
  if (n === "kyan") return { solid: "var(--kyan)", css: "c-kyan", hex: "#22c55e", deep: "var(--kyan-deep)" };
  if (n === "meryl") return { solid: "var(--meryl)", css: "c-meryl", hex: "#14b8a6", deep: "var(--meryl-deep)" };
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
document.querySelectorAll(".tab").forEach(t => {
  t.addEventListener("click", () => {
    document.querySelectorAll(".tab").forEach(x => x.classList.remove("active"));
    document.querySelectorAll(".panel").forEach(x => x.classList.remove("active"));
    t.classList.add("active");
    document.getElementById("panel-" + t.dataset.tab).classList.add("active");
    if (t.dataset.tab === "summary") renderYearSummary();
    if (t.dataset.tab === "generate") renderGenerateList();
  });
});

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

function renderCalendar() {
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
    el.onclick = () => cycleDay(d);

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
      el.dataset.child = activeChild.toLowerCase() === "meryl" ? "meryl" : "";
      if (state === "pern") { el.style.background = col.hex; el.style.borderColor = col.hex; el.style.color = col.deep; }
      else if (state === "sing") { el.style.background = col.hex + "55"; el.style.borderColor = col.hex; el.style.color = "var(--text)"; }
      el.textContent = d;
    }
    grid.appendChild(el);
  }
  renderLegend();
  updateStats();
}

function cycleDay(d) {
  const entry = getEntry(curYear, curMonth, activeChild);
  const cur = entry[d] || "";
  const next = cur === "" ? "pern" : cur === "pern" ? "sing" : "";
  if (next === "") delete entry[d]; else entry[d] = next;
  saveData();
  renderCalendar();
}

function updateStats() {
  const bar = document.getElementById("statsBar");
  const dim = daysInMonth(curYear, curMonth);
  bar.innerHTML = "";

  if (comboMode) {
    DATA.children.forEach(c => {
      const entry = getEntry(curYear, curMonth, c);
      const vals = Object.values(entry);
      const tot = vals.length;
      const pct = percentOf(tot, dim);
      const col = getChildColor(c);
      const card = document.createElement("div");
      card.className = "statcard " + col.css;
      card.innerHTML = `<div class="n">${tot}</div><div class="l">${escapeHtml(c)}</div><div class="pct">${pct}%</div>`;
      bar.appendChild(card);
    });
    return;
  }

  const entry = getEntry(curYear, curMonth, activeChild);
  const vals = Object.values(entry);
  const pern = vals.filter(v => v==="pern").length;
  const sing = vals.filter(v => v==="sing").length;
  const tot = pern + sing;
  const col = getChildColor(activeChild);
  const items = [
    [tot, "giorni", col.css, percentOf(tot, dim)],
    [pern, "pernott.", col.css, percentOf(pern, dim)],
    [sing, "singoli", col.css, percentOf(sing, dim)],
  ];
  items.forEach(([n, l, cls, pct]) => {
    const card = document.createElement("div");
    card.className = "statcard " + cls;
    card.innerHTML = `<div class="n">${n}</div><div class="l">${l}</div><div class="pct">${pct}%</div>`;
    bar.appendChild(card);
  });
}

function changeMonth(delta) {
  curMonth += delta;
  if (curMonth > 11) { curMonth = 0; curYear++; }
  if (curMonth < 0) { curMonth = 11; curYear--; }
  renderCalendar();
  if (document.getElementById("panel-generate").classList.contains("active")) renderGenerateList();
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
  if (!DATA.entries[curKey]) DATA.entries[curKey] = {};
  DATA.entries[curKey][activeChild] = JSON.parse(JSON.stringify(DATA.entries[prevKey][activeChild]));
  saveData(); renderCalendar();
  toast("Copiato dal mese precedente");
}

function clearMonth() {
  if (!confirm(`Svuotare tutti i giorni di ${activeChild} per ${MESI[curMonth]} ${curYear}?`)) return;
  const key = monthKey(curYear, curMonth);
  if (DATA.entries[key]) delete DATA.entries[key][activeChild];
  saveData(); renderCalendar();
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
  const w = window.open("");
  const rows = document.getElementById("yearTable").innerHTML;
  const col = getChildColor(activeChild);
  w.document.write(`
    <html><head><title>Riepilogo ${curYear}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:20px}
      h2{margin-bottom:4px;color:${col.hex}} p{color:#555;font-size:12px;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th,td{border:1px solid #999;padding:8px;text-align:center}
      th{background:#eee}
    </style></head><body>
    <h2>Riepilogo annuale diritti di visita — ${escapeHtml(activeChild)}</h2>
    <p>Anno ${curYear} — ${escapeHtml(DATA.profile.richiedente)}</p>
    <table>${rows}</table>
    </body></html>
  `);
  w.document.close();
  setTimeout(() => w.print(), 300);
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
        DATA = safe;
        comboMode = !!DATA.comboMode;
        saveData();
        activeChild = DATA.children[0] || "";
        renderCalendar();
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
const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

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

  safe.comboMode = !!parsed.comboMode;
  return safe;
}

// ══════════════════════════════════════════════════════════════════════
// IMPOSTAZIONI
// ══════════════════════════════════════════════════════════════════════
function openModal(id) {
  if (id === "settingsModal") {
    document.getElementById("setRichiedente").value = DATA.profile.richiedente;
    document.getElementById("setDomicilio").value = DATA.profile.domicilio;
    document.getElementById("setFunzionario").value = DATA.profile.funzionario;
    renderChildFields();
  }
  document.getElementById(id).classList.add("show");
}
function closeModal(id) { document.getElementById(id).classList.remove("show"); }

function renderChildFields() {
  const list = document.getElementById("childList");
  list.innerHTML = "";
  DATA.children.forEach((c, i) => {
    const col = getChildColor(c);
    const row = document.createElement("div");
    row.className = "childlist-item";

    const dot = document.createElement("span");
    dot.className = "dot";
    dot.style.background = col.hex;
    row.appendChild(dot);

    const input = document.createElement("input");
    input.value = c;
    input.dataset.idx = String(i);
    input.setAttribute("aria-label", `Nome del figlio ${i + 1}`);
    row.appendChild(input);

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
function addChildField() { DATA.children.push("Nuovo figlio"); renderChildFields(); }
function removeChildField(i) {
  if (DATA.children.length <= 1) { alert("Deve restare almeno un figlio."); return; }
  DATA.children.splice(i, 1); renderChildFields();
}
function saveSettings() {
  DATA.profile.richiedente = document.getElementById("setRichiedente").value.trim();
  const domicilioValue = document.getElementById("setDomicilio").value.trim();
  DATA.profile.domicilio = domicilioValue && domicilioValue.toLowerCase() !== "agno" ? domicilioValue : "";
  DATA.profile.funzionario = document.getElementById("setFunzionario").value.trim();
  const inputs = document.querySelectorAll("#childList input");
  DATA.children = Array.from(inputs).map(i => i.value.trim()).filter(v => v);
  if (!DATA.children.includes(activeChild)) activeChild = DATA.children[0];
  saveData(); closeModal("settingsModal"); renderCalendar();
  toast("Impostazioni salvate");
}

// ══════════════════════════════════════════════════════════════════════
// GENERAZIONE MODULI PDF (pdf-lib, compila il modulo ufficiale AcroForm)
// ══════════════════════════════════════════════════════════════════════
function base64ToBytes(b64) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

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

  const templateNode = document.getElementById("templateData");
  if (templateNode && templateNode.dataset && templateNode.dataset.b64) {
    return base64ToBytes(templateNode.dataset.b64);
  }

  throw new Error("Template PDF ufficiale non disponibile.");
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
    btn.textContent = "Genera";
    btn.onclick = () => generateSingleForm(child);
    row.appendChild(btn);
    list.appendChild(row);
  });
}

async function fillFormPdf(child) {
  const { PDFDocument } = PDFLib;
  const bytes = await getTemplatePdfBytes();
  const pdfDoc = await PDFDocument.load(bytes);
  const form = pdfDoc.getForm();

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

  const domicileValue = (DATA.profile.domicilio || "").trim();
  const normalizedDomicilio = domicileValue && domicileValue.toLowerCase() !== "agno" ? domicileValue : "";
  const todayString = formatItalianDate(new Date());

  setIfExists("Funzionario incaricato", DATA.profile.funzionario);
  setIfExists("Cognome e nome", DATA.profile.richiedente);
  if (normalizedDomicilio) setIfExists("Domicilio", normalizedDomicilio);
  else setIfExists("Domicilio", "");

  const cognomeBase = DATA.profile.richiedente.split(" ")[0] || "";
  setIfExists("una richiesta per figlio", `${cognomeBase} ${child}`.trim());
  ["per il mese", "Data", "data", "Data odierna", "data odierna"].forEach(name => setIfExists(name, todayString));

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
  return await pdfDoc.save();
}

function pdfFilename(child) {
  const mese = MESI[curMonth].toLowerCase();
  return `diritti_di_visita_${mese}_${curYear}_${child}.pdf`;
}

async function generateSingleForm(child) {
  document.getElementById("genStatus").textContent = `Generazione modulo ${child}…`;
  try {
    const bytes = await fillFormPdf(child);
    downloadOrSharePdf(bytes, pdfFilename(child));
    document.getElementById("genStatus").textContent = `✓ Modulo ${child} generato.`;
  } catch (e) { document.getElementById("genStatus").textContent = "Errore: " + e.message; }
}

async function generateAllForms() {
  document.getElementById("genStatus").textContent = "Generazione in corso…";
  for (const child of DATA.children) {
    try {
      const bytes = await fillFormPdf(child);
      downloadOrSharePdf(bytes, pdfFilename(child));
    } catch (e) {
      document.getElementById("genStatus").textContent = "Errore su " + child + ": " + e.message;
      return;
    }
  }
  document.getElementById("genStatus").textContent = `✓ ${DATA.children.length} moduli generati per ${MESI[curMonth]} ${curYear}.`;
}

async function downloadOrSharePdf(bytes, filename) {
  const blob = new Blob([bytes], { type: "application/pdf" });
  if (navigator.canShare) {
    const file = new File([blob], filename, { type: "application/pdf" });
    if (navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; } catch (e) {}
    }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

// ══════════════════════════════════════════════════════════════════════
// AVVIO
// ══════════════════════════════════════════════════════════════════════
document.getElementById("comboBtn").classList.toggle("on", comboMode);
renderCalendar();
