// ══════════════════════════════════════════════════════════════════════
// FUNZIONI AGGIUNTIVE: note del giorno, annulla, schema ricorrente,
// prospetto stampabile. Usa le variabili e funzioni globali di app-core.js.
// ══════════════════════════════════════════════════════════════════════
(() => {
  "use strict";
  const $ = (id) => document.getElementById(id);
  const pad2 = (n) => String(n).padStart(2, "0");
  const isoOf = (y, m, d) => `${y}-${pad2(m + 1)}-${pad2(d)}`;
  const swiss = (iso) => { const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };
  const GIORNI = ["lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato", "domenica"];
  const weekdayIdx = (y, m, d) => (new Date(y, m, d).getDay() + 6) % 7;
  const cloneNotes = () => JSON.parse(JSON.stringify(DATA.notes || {}));
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  // ── ANNULLA ────────────────────────────────────────────────────────
  // Ogni modifica salva lo stato precedente; la barra «Annulla» resta 7 secondi.
  let undoState = null;
  let undoTimer = null;
  window.pushUndo = function (label) {
    undoState = { label, entries: cloneEntries(), notes: cloneNotes() };
    clearTimeout(undoTimer);
    // la barra va mostrata dopo che la modifica è stata applicata
    setTimeout(showUndo, 0);
  };
  function showUndo() {
    const bar = $("undoBar");
    if (!bar || !undoState) return;
    $("undoText").textContent = undoState.label;
    bar.hidden = false;
    clearTimeout(undoTimer);
    undoTimer = setTimeout(hideUndo, 7000);
  }
  function hideUndo() { const bar = $("undoBar"); if (bar) bar.hidden = true; undoState = null; }
  function doUndo() {
    if (!undoState || READONLY_TOKEN) return;
    const curEntries = cloneEntries();
    const curNotes = cloneNotes();
    DATA.entries = undoState.entries;
    DATA.notes = undoState.notes;
    undoState = null;
    saveData();
    renderCalendar();
    if (typeof invalidateGenerated === "function") invalidateGenerated();
    syncHook("entriesChanged", curEntries);
    syncHook("notesChanged", curNotes);
    hideUndo();
    toast("↶ Modifica annullata");
  }

  // ── NOTE DEL GIORNO ────────────────────────────────────────────────
  let noteIso = null;
  window.openNoteEditor = function (d) {
    if (READONLY_TOKEN) return;
    noteIso = isoOf(curYear, curMonth, d);
    $("noteTitle").textContent = `Nota del ${GIORNI[weekdayIdx(curYear, curMonth, d)]} ${swiss(noteIso)}`;
    const txt = (DATA.notes || {})[noteIso] || "";
    $("noteText").value = txt;
    $("noteDelete").hidden = !txt;
    $("noteModal").classList.add("show");
    setTimeout(() => $("noteText").focus(), 60);
  };
  function closeNote() { $("noteModal").classList.remove("show"); noteIso = null; }
  function saveNote(remove) {
    if (!noteIso) return;
    const text = remove ? "" : ($("noteText").value || "").trim().slice(0, 500);
    const old = (DATA.notes || {})[noteIso] || "";
    if (text === old) { closeNote(); return; }
    const before = cloneNotes();
    pushUndo(text ? `Nota del ${swiss(noteIso)} salvata` : `Nota del ${swiss(noteIso)} eliminata`);
    if (!DATA.notes) DATA.notes = {};
    if (text) DATA.notes[noteIso] = text; else delete DATA.notes[noteIso];
    saveData();
    syncHook("notesChanged", before);
    closeNote();
    renderCalendar();
  }

  window.renderNotesList = function () {
    const box = $("notesList");
    if (!box) return;
    box.textContent = "";
    const prefix = `${curYear}-${pad2(curMonth + 1)}-`;
    const keys = Object.keys(DATA.notes || {}).filter(k => k.startsWith(prefix)).sort();
    $("notesSection").hidden = !keys.length && !notesMode;
    if (!keys.length) { box.appendChild(el("div", "hint", READONLY_TOKEN ? "Nessuna nota in questo mese." : "Nessuna nota. Tieni premuto un giorno (o attiva ✎ Note e toccalo) per aggiungerne una.")); return; }
    keys.forEach(k => {
      const d = parseInt(k.slice(8), 10);
      const row = el(READONLY_TOKEN ? "div" : "button", "note-row");
      if (!READONLY_TOKEN) { row.type = "button"; row.addEventListener("click", () => openNoteEditor(d)); row.setAttribute("aria-label", `Modifica la nota del ${swiss(k)}`); }
      row.appendChild(el("span", "note-date", `${GIORNI[weekdayIdx(curYear, curMonth, d)].slice(0, 3)} ${swiss(k).slice(0, 5)}`));
      row.appendChild(el("span", "note-text", DATA.notes[k]));
      box.appendChild(row);
    });
  };

  function toggleNotesMode() {
    notesMode = !notesMode;
    $("notesBtn").classList.toggle("on", notesMode);
    $("notesBtn").setAttribute("aria-pressed", String(notesMode));
    document.body.classList.toggle("notes-mode", notesMode);
    toast(notesMode ? "✎ Modalità note: tocca un giorno per scrivere" : "Modalità note disattivata");
    renderCalendar();
  }

  // ── SCHEMA RICORRENTE ──────────────────────────────────────────────
  const SHORT = ["L", "M", "M", "G", "V", "S", "D"];
  let draftSchedule = null;
  window.renderScheduleEditor = function () {
    const box = $("scheduleEditor");
    if (!box) return;
    draftSchedule = JSON.parse(JSON.stringify(sanitizeSchedule(DATA.schedule)));
    $("scheduleRef").value = draftSchedule.ref;
    box.textContent = "";
    [["A", "Settimana A (weekend con te)"], ["B", "Settimana B"]].forEach(([w, label]) => {
      const row = el("div", "sched-row");
      row.appendChild(el("div", "sched-label", label));
      const cells = el("div", "sched-cells");
      for (let i = 0; i < 7; i++) {
        const b = el("button", "sched-cell");
        b.type = "button";
        const paint = () => {
          const v = draftSchedule[w][i];
          b.textContent = SHORT[i];
          b.dataset.kind = v;
          b.setAttribute("aria-label", `${label}, ${GIORNI[i]}: ${KIND_LABEL[v] || "nessuna visita"}`);
        };
        b.addEventListener("click", () => {
          const v = draftSchedule[w][i];
          draftSchedule[w][i] = v === "" ? "pern" : v === "pern" ? "sing" : "";
          paint();
        });
        paint();
        cells.appendChild(b);
      }
      row.appendChild(cells);
      box.appendChild(row);
    });
  };
  window.readScheduleEditor = function () {
    if (!draftSchedule) return sanitizeSchedule(DATA.schedule);
    const ref = $("scheduleRef").value;
    if (/^\d{4}-\d{2}-\d{2}$/.test(ref)) {
      // si normalizza al lunedì della settimana scelta
      const dt = new Date(ref + "T12:00:00");
      dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7));
      draftSchedule.ref = isoOf(dt.getFullYear(), dt.getMonth(), dt.getDate());
    }
    return sanitizeSchedule(draftSchedule);
  };
  function weekType(y, m, d) {
    const sc = sanitizeSchedule(DATA.schedule);
    const ref = new Date(sc.ref + "T12:00:00");
    const day = new Date(y, m, d, 12);
    const weeks = Math.floor(Math.round((day - ref) / 86400000) / 7);
    return ((weeks % 2) + 2) % 2 === 0 ? "A" : "B";
  }
  function applySchedule() {
    if (READONLY_TOKEN) return;
    const sc = sanitizeSchedule(DATA.schedule);
    const dim = daysInMonth(curYear, curMonth);
    const plan = [];
    DATA.children.forEach(c => {
      const entry = getEntry(curYear, curMonth, c);
      for (let d = 1; d <= dim; d++) {
        const v = sc[weekType(curYear, curMonth, d)][weekdayIdx(curYear, curMonth, d)];
        if (v && !entry[d]) plan.push([c, d, v]);
      }
    });
    if (!plan.length) { toast("Nessun giorno vuoto da completare con lo schema"); return; }
    const who = DATA.children.join(" e ");
    if (!confirm(`Applicare lo schema a ${MESI[curMonth]} ${curYear} per ${who}?\n\nVerranno segnati ${plan.length} giorni ancora vuoti. I giorni già segnati non vengono toccati. Potrai annullare subito dopo.`)) return;
    const before = cloneEntries();
    pushUndo(`Schema applicato a ${MESI[curMonth].toLowerCase()} (${plan.length} giorni)`);
    plan.forEach(([c, d, v]) => { getEntry(curYear, curMonth, c)[d] = v; });
    saveData();
    renderCalendar();
    if (typeof invalidateGenerated === "function") invalidateGenerated();
    syncHook("entriesChanged", before);
  }

  // ── PROSPETTO STAMPABILE ───────────────────────────────────────────
  // Costruito dentro la pagina (non in un popup: la CSP del popup bloccherebbe
  // gli stili). Si stampa o si salva in PDF dal menu di stampa del telefono.
  window.printReport = function (opts) {
    const year = (opts && opts.year) || curYear;
    const children = (opts && opts.children) || DATA.children;
    const detail = !opts || opts.detail !== false;
    const area = $("printArea");
    area.textContent = "";
    area.appendChild(el("h1", null, detail ? "Prospetto diritti di visita" : "Riepilogo annuale diritti di visita"));
    const sub = [];
    if (DATA.profile.richiedente) sub.push("Richiedente: " + DATA.profile.richiedente);
    sub.push("Anno " + year);
    sub.push("Figli: " + children.join(", "));
    area.appendChild(el("p", "pr-sub", sub.join(" · ")));
    const st = window.CloudSync ? window.CloudSync.status() : null;
    area.appendChild(el("p", "pr-sub", `Generato il ${new Date().toLocaleString("it-CH")}` +
      (READONLY_TOKEN ? " · dati dal link di sola lettura"
        : st && st.lastSync ? ` · dati sincronizzati con il database il ${new Date(st.lastSync).toLocaleString("it-CH")}` : " · dati del dispositivo")));

    // Totali per mese
    const t = el("table", "pr-table");
    const head = el("tr");
    ["Mese", ...children.flatMap(c => [`${c} – pernott.`, `${c} – singoli`])].forEach(h => head.appendChild(el("th", null, h)));
    t.appendChild(head);
    const tot = children.map(() => [0, 0]);
    for (let m = 0; m < 12; m++) {
      const tr = el("tr");
      tr.appendChild(el("td", "pr-left", MESI[m]));
      children.forEach((c, i) => {
        const vals = Object.values(((DATA.entries[monthKey(year, m)] || {})[c]) || {});
        const p = vals.filter(v => v === "pern").length, s = vals.filter(v => v === "sing").length;
        tot[i][0] += p; tot[i][1] += s;
        tr.appendChild(el("td", null, String(p)));
        tr.appendChild(el("td", null, String(s)));
      });
      t.appendChild(tr);
    }
    const trt = el("tr", "pr-total");
    trt.appendChild(el("td", "pr-left", "Totale anno"));
    tot.forEach(([p, s]) => { trt.appendChild(el("td", null, String(p))); trt.appendChild(el("td", null, String(s))); });
    t.appendChild(trt);
    area.appendChild(t);

    if (detail) {
      // Dettaglio giorno per giorno con le note
      area.appendChild(el("h2", null, "Dettaglio dei giorni"));
      const td = el("table", "pr-table");
      const h2 = el("tr");
      ["Data", "Giorno", ...children, "Nota"].forEach(h => h2.appendChild(el("th", null, h)));
      td.appendChild(h2);
      let rows = 0;
      for (let m = 0; m < 12; m++) {
        const dim = daysInMonth(year, m);
        for (let d = 1; d <= dim; d++) {
          const iso = isoOf(year, m, d);
          const kinds = children.map(c => (((DATA.entries[monthKey(year, m)] || {})[c]) || {})[d] || "");
          const note = (DATA.notes || {})[iso] || "";
          if (!kinds.some(Boolean) && !note) continue;
          const tr = el("tr");
          tr.appendChild(el("td", null, swiss(iso)));
          tr.appendChild(el("td", null, GIORNI[weekdayIdx(year, m, d)]));
          kinds.forEach(k => tr.appendChild(el("td", null, k === "pern" ? "pernottamento" : k === "sing" ? "giorno singolo" : "—")));
          tr.appendChild(el("td", "pr-left", note));
          td.appendChild(tr);
          rows++;
        }
      }
      if (rows) area.appendChild(td); else area.appendChild(el("p", null, "Nessun giorno segnato in quest'anno."));
      area.appendChild(el("p", "pr-foot", "Legenda: pernottamento = notte trascorsa dal padre; giorno singolo = visita senza pernottamento. " +
        "Lo storico completo e non modificabile di ogni modifica è conservato nel database dell'app."));
    }
    document.body.classList.add("printing");
    const done = () => { document.body.classList.remove("printing"); window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    setTimeout(() => { window.print(); setTimeout(done, 1500); }, 50);
  };

  // ── PROMEMORIA MODULI DI FINE MESE ─────────────────────────────────
  // Dal 28 del mese al 5 del mese successivo l'app ricorda di preparare i
  // moduli USSI, finché non si preme «Fatto».
  const REM_KEY = "diritti_visita_moduli_fatti_";
  let remTarget = null;
  function checkReminder() {
    if (READONLY_TOKEN) return;
    const t = new Date();
    let y = t.getFullYear(), m = t.getMonth();
    if (t.getDate() <= 5) { m -= 1; if (m < 0) { m = 11; y--; } }
    else if (t.getDate() < 28) return;
    const key = REM_KEY + `${y}-${pad2(m + 1)}`;
    let done = false;
    try { done = !!localStorage.getItem(key); } catch (_) {}
    if (done) return;
    remTarget = { y, m, key };
    $("reminderText").textContent = `📅 È il momento dei moduli USSI di ${MESI[m].toLowerCase()} ${y}: controlla il calendario, genera i moduli e firmali.`;
    $("reminderBar").hidden = false;
  }
  function reminderGo() {
    if (!remTarget) return;
    curYear = remTarget.y; curMonth = remTarget.m;
    renderCalendar();
    if (typeof invalidateGenerated === "function") invalidateGenerated();
    showTab("generate");
    if (typeof Nav !== "undefined") Nav.record();
  }
  function reminderDone() {
    if (remTarget) { try { localStorage.setItem(remTarget.key, new Date().toISOString()); } catch (_) {} }
    $("reminderBar").hidden = true;
  }

  // ── AVVIO ──────────────────────────────────────────────────────────
  function init() {
    const on = (id, fn) => { const e = $(id); if (e) e.addEventListener("click", fn); };
    on("undoBtn", doUndo);
    on("notesBtn", toggleNotesMode);
    on("noteSave", () => saveNote(false));
    on("noteDelete", () => saveNote(true));
    on("noteCancel", closeNote);
    on("scheduleApply", applySchedule);
    on("reportBtn", () => printReport({ year: curYear, children: DATA.children, detail: true }));
    const nm = $("noteModal");
    if (nm) nm.addEventListener("click", (e) => { if (e.target === nm) closeNote(); });
    const ta = $("noteText");
    if (ta) ta.addEventListener("keydown", (e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) saveNote(false); if (e.key === "Escape") closeNote(); });
    on("reminderGo", reminderGo);
    on("reminderDone", reminderDone);
    renderNotesList();
    checkReminder();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
