#!/usr/bin/env node
// Genera i moduli ufficiali USSI/URAR «Richiesta prestazione speciale per diritti
// di visita» per un mese, partendo dai dati del database (stessa logica dell'app).
//
// Uso:  node tools/genera-moduli.cjs dati.json cartella-uscita
// dati.json = { "mese": "2026-11",
//               "profile": { richiedente, domicilio, funzionario },
//               "children": ["Meryl Diasio", ...], "birthdates": { nome: "aaaa-mm-gg" },
//               "visits": [ { "child", "day": "aaaa-mm-gg", "kind": "pern"|"sing" } ] }
// Firma e data vanno sempre aggiunte a mano.
"use strict";
const fs = require("fs");
const path = require("path");
const PDFLib = require(path.join(__dirname, "..", "pdf-lib.min.js"));

const MESI = ["Gennaio","Febbraio","Marzo","Aprile","Maggio","Giugno","Luglio","Agosto","Settembre","Ottobre","Novembre","Dicembre"];
const swiss = (iso) => { const m = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})$/); return m ? `${m[3]}.${m[2]}.${m[1]}` : ""; };

async function main() {
  const [input, outDir] = process.argv.slice(2);
  if (!input || !outDir) { console.error("Uso: node tools/genera-moduli.cjs dati.json cartella-uscita"); process.exit(2); }
  const data = JSON.parse(fs.readFileSync(input, "utf8"));
  const m = String(data.mese || "").match(/^(\d{4})-(\d{2})$/);
  if (!m) throw new Error("Campo «mese» mancante o non valido (atteso aaaa-mm)");
  const year = Number(m[1]), month = Number(m[2]) - 1;
  const template = fs.readFileSync(path.join(__dirname, "..", "modulo-ufficiale.pdf"));
  const profile = data.profile || {};
  fs.mkdirSync(outDir, { recursive: true });
  const today = new Intl.DateTimeFormat("it-CH", { day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date());
  const summary = [];

  for (const child of data.children || []) {
    const pdfDoc = await PDFLib.PDFDocument.load(template);
    const form = pdfDoc.getForm();
    const blocked = (n) => /firma|signature|timbro|stampa|data firma|firma del/.test(String(n).toLowerCase());
    const set = (name, value) => { if (blocked(name)) return; try { form.getTextField(name).setText(value == null ? "" : String(value).trim()); } catch (_) {} };
    set("Funzionario incaricato", profile.funzionario || "");
    set("Cognome e nome", profile.richiedente || "");
    set("Domicilio", profile.domicilio || "");
    const cognome = String(profile.richiedente || "").split(" ")[0] || "";
    const hasSurname = cognome && child.toLowerCase().split(/\s+/).includes(cognome.toLowerCase());
    set("per figlio", hasSurname ? child : `${cognome} ${child}`.trim());
    set("data di nascita", swiss((data.birthdates || {})[child]));
    set("per il mese", `${MESI[month]} ${year}`);
    ["Data", "data", "Data odierna", "data odierna"].forEach(n => set(n, today));
    for (let d = 1; d <= 31; d++) { set(`Per notte con pernottamento${d}`, ""); set(`Giorno singolo senza pernottamento${d}`, ""); }
    let pern = 0, sing = 0;
    for (const v of data.visits || []) {
      if (v.child !== child || !String(v.day).startsWith(`${m[1]}-${m[2]}-`)) continue;
      const d = Number(String(v.day).slice(8, 10));
      if (v.kind === "pern") { set(`Per notte con pernottamento${d}`, "1"); pern++; }
      if (v.kind === "sing") { set(`Giorno singolo senza pernottamento${d}`, "1"); sing++; }
    }
    try { form.updateFieldAppearances(); } catch (_) {}
    try { form.acroForm.dict.set(PDFLib.PDFName.of("NeedAppearances"), PDFLib.PDFBool.True); } catch (_) {}
    const file = path.join(outDir, `diritti_di_visita_${MESI[month].toLowerCase()}_${year}_${child}.pdf`);
    fs.writeFileSync(file, await pdfDoc.save());
    summary.push({ child, file, pernottamenti: pern, singoli: sing });
  }
  console.log(JSON.stringify(summary, null, 2));
}
main().catch(e => { console.error(e.message || e); process.exit(1); });
