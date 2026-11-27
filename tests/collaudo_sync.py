"""Collaudo end-to-end della sincronizzazione.
Richiede: utente di prova nel database (poi da eliminare), COLLAUDO_EMAIL e COLLAUDO_PASSWORD.
"""
import json, re, sys, time, subprocess, os
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
URL = "http://localhost:8765/"
EMAIL = os.environ["COLLAUDO_EMAIL"]
PW = os.environ["COLLAUDO_PASSWORD"]
results = []
def check(name, cond, extra=""):
    results.append((name, bool(cond), extra))
    print(("OK   " if cond else "FAIL ") + name + (" -- " + str(extra) if extra and not cond else ""), flush=True)

srv = subprocess.Popen([sys.executable, "-m", "http.server", "8765", "--bind", "127.0.0.1"], cwd=ROOT,
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)

SEED = {
  "profile": {"richiedente": "Test Padre", "domicilio": "Via Prova 1", "funzionario": "Funz"},
  "children": ["Meryl Test", "Kyan Test"],
  "birthdates": {},
  "entries": {"2026-11": {"Meryl Test": {"4": "pern", "5": "sing", "27": "pern"},
                          "Kyan Test": {"4": "pern", "5": "sing", "25": "pern", "26": "sing"}}},
  "comboMode": False,
}

DBQ = """async ([email, pw, sql]) => {
  const c = window.supabase.createClient(window.CLOUD_CONFIG.url, window.CLOUD_CONFIG.key,
     {auth:{persistSession:false, autoRefreshToken:false, storageKey:'collaudo'}});
  const r = await c.auth.signInWithPassword({email, password: pw});
  if (r.error) return {error: r.error.message};
  const out = {};
  const v = await c.from('visits').select('child,day,kind').order('day');
  out.visits = v.data; out.vErr = v.error && v.error.message;
  const a = await c.from('visits_audit').select('child,day,old_kind,new_kind,actor').order('id');
  out.audit = a.data;
  const s = await c.from('app_settings').select('children,profile').maybeSingle();
  out.settings = s.data;
  const l = await c.from('share_links').select('token,revoked_at,use_count').order('created_at');
  out.links = l.data;
  await c.auth.signOut();
  return out;
}"""

def db(page):
    return page.evaluate(DBQ, [EMAIL, PW, ""])

def day_cell(page, d):
    return page.locator("#calGrid .daycell:not(.empty)").nth(d - 1)

def wait_state(page, states, timeout=20):
    t = time.time()
    while time.time() - t < timeout:
        st = page.evaluate("() => window.CloudSync && window.CloudSync.status()")
        if st and st["state"] in states and (st["pending"] == 0 or "pending" in states):
            return st
        time.sleep(0.3)
    return page.evaluate("() => window.CloudSync && window.CloudSync.status()")

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True,
        **({"proxy": {"server": os.environ["HTTPS_PROXY"], "bypass": "localhost,127.0.0.1"}} if os.environ.get("HTTPS_PROXY") else {}))
    errors = []
    def mk(seed=None):
        ctx = browser.new_context(service_workers="block")
        if seed is not None:
            ctx.add_init_script("if(!localStorage.getItem('diritti_visita_data_v1'))localStorage.setItem('diritti_visita_data_v1', %s);" % json.dumps(json.dumps(seed)))
        pg = ctx.new_page()
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("dialog", lambda d: d.accept())
        pg.clock.install(time="2026-11-27T10:00:00")  # data fissa: novembre 2026
        return ctx, pg

    # ── I. regressione senza cloud ────────────────────────────
    ctxA, A = mk(SEED)
    A.goto(URL); A.wait_for_timeout(1500)
    check("app si avvia, mese Novembre 2026", "Novembre 2026" in A.inner_text("#monthLabel"))
    check("badge visibile e 'non collegato'", A.get_attribute("#syncBadge", "data-state") == "off")
    check("giorni locali visibili (4 = pern)", "pern" in day_cell(A, 4).get_attribute("class"))
    day_cell(A, 10).click(); A.wait_for_timeout(200)
    loc = json.loads(A.evaluate("() => localStorage.getItem('diritti_visita_data_v1')"))
    check("senza login: modifica salvata in locale", loc["entries"]["2026-11"]["Meryl Test"].get("10") == "pern")
    check("senza login: nessuna coda creata", A.evaluate("() => localStorage.getItem('diritti_visita_sync_queue_v1')") in (None, '{"days":{},"settings":0}'))

    # ── A. primo collegamento: caricamento dati locali ─────────
    A.click("[data-action=open-settings]")
    A.fill("#syncEmail", EMAIL); A.fill("#syncPassword", PW); A.click("#syncSignIn")
    st = wait_state(A, ["ok"], 25)
    check("login e sincronizzazione completata", st and st["state"] == "ok", st)
    d = db(A)
    check("DB: 8 giorni caricati", d["visits"] and len(d["visits"]) == 8, d.get("visits"))
    check("DB: impostazioni caricate", d["settings"] and d["settings"]["children"] == ["Meryl Test", "Kyan Test"], d.get("settings"))
    check("DB: storico registra inserimenti con autore app", d["audit"] and all("(app)" in r["actor"] for r in d["audit"]) and len(d["audit"]) == 8, d.get("audit"))
    check("copia di sicurezza pre-sync salvata", A.evaluate("() => !!localStorage.getItem('diritti_visita_presync_backup_v1')"))
    A.click("[data-action=close-settings]")

    # ── B. modifica sincronizzata ──────────────────────────────
    day_cell(A, 27).click()  # pern -> sing
    A.wait_for_timeout(300)
    st = wait_state(A, ["ok"], 15)
    d = db(A)
    k = {(r["child"], r["day"]): r["kind"] for r in d["visits"]}
    check("modifica giorno 27 → singolo nel DB", k.get(("Meryl Test", "2026-11-27")) == "sing", k)
    check("storico: pern → sing registrato", any(r["day"] == "2026-11-27" and r["old_kind"] == "pern" and r["new_kind"] == "sing" for r in d["audit"]))
    day_cell(A, 10).click(); day_cell(A, 10).click()  # 10: pern -> sing -> vuoto
    st = wait_state(A, ["ok"], 15)
    d = db(A); k = {(r["child"], r["day"]): r["kind"] for r in d["visits"]}
    check("cancellazione giorno 10 propagata", ("Meryl Test", "2026-11-10") not in k, k)

    # ── C. secondo dispositivo vuoto ───────────────────────────
    ctxB, B = mk(None)
    B.goto(URL); B.wait_for_timeout(1200)
    B.click("[data-action=open-settings]")
    B.fill("#syncEmail", EMAIL); B.fill("#syncPassword", PW); B.click("#syncSignIn")
    st = wait_state(B, ["ok"], 25)
    B.click("[data-action=close-settings]"); B.wait_for_timeout(300)
    names = B.inner_text("#childSegCal")
    check("dispositivo 2: figli scaricati", "Meryl Test" in names and "Kyan Test" in names, names)
    check("dispositivo 2: giorno 27 singolo", "sing" in day_cell(B, 27).get_attribute("class"))
    check("dispositivo 2: giorno 10 vuoto", "pern" not in day_cell(B, 10).get_attribute("class") and "sing" not in day_cell(B, 10).get_attribute("class"))
    d = db(B)
    check("dispositivo 2 vuoto non ha cancellato nulla", len(d["visits"]) == 7, len(d["visits"]))

    # ── D. offline e ripresa ───────────────────────────────────
    ctxB.set_offline(True)
    day_cell(B, 12).click(); B.wait_for_timeout(1500)
    st = B.evaluate("() => CloudSync.status()")
    check("offline: modifica in coda", st["pending"] >= 1, st)
    check("offline: salvata in locale", json.loads(B.evaluate("() => localStorage.getItem('diritti_visita_data_v1')"))["entries"]["2026-11"]["Meryl Test"].get("12") == "pern")
    ctxB.set_offline(False)
    B.evaluate("() => window.dispatchEvent(new Event('online'))")
    st = wait_state(B, ["ok"], 40)
    check("ripresa rete: coda inviata", st["pending"] == 0 and st["state"] == "ok", st)
    A.evaluate("() => CloudSync.syncNow()"); A.wait_for_timeout(2500)
    check("dispositivo 1 riceve la modifica del 2", "pern" in day_cell(A, 12).get_attribute("class"))

    # ── H. rinomina figlio ─────────────────────────────────────
    A.click("[data-action=open-settings]")
    A.locator("#childList .child-name").nth(1).fill("Kyan Rinominato")
    A.click("[data-action=save-settings]")
    st = wait_state(A, ["ok"], 20)
    d = db(A); kids = set(r["child"] for r in d["visits"])
    check("rinomina: giorni spostati sul nuovo nome nel DB", "Kyan Rinominato" in kids and "Kyan Test" not in kids, kids)
    check("rinomina: impostazioni aggiornate", d["settings"]["children"] == ["Meryl Test", "Kyan Rinominato"], d["settings"])

    # ── E. sicurezza: registrazioni e accesso anonimo ─────────
    sec = A.evaluate("""async () => {
      const c = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.key, {auth:{persistSession:false, storageKey:'x'}});
      const su = await c.auth.signUp({email:'intruso-claude@example.org', password:'Intruso-Password-1234'});
      const v = await c.from('visits').select('*');
      const a = await c.from('visits_audit').select('*');
      const s = await c.from('app_settings').select('*');
      const l = await c.from('share_links').select('*');
      const ins = await c.from('visits').insert({child:'x', day:'2026-11-01', kind:'pern'});
      const rpc = await c.rpc('get_shared_calendar', {p_token:'00000000-0000-0000-0000-000000000000'});
      return {su: su.error && su.error.message, v: [v.data, v.error && v.error.code], a: [a.data, a.error && a.error.code],
              s: [s.data, s.error && s.error.code], l: [l.data, l.error && l.error.code], ins: ins.error && ins.error.code, rpc: rpc.error && rpc.error.message};
    }""")
    check("seconda registrazione rifiutata", sec["su"] is not None, sec["su"])
    check("anonimo: nessun accesso a visits", not sec["v"][0], sec["v"])
    check("anonimo: nessun accesso allo storico", not sec["a"][0], sec["a"])
    check("anonimo: nessun accesso a impostazioni", not sec["s"][0], sec["s"])
    check("anonimo: nessun accesso ai link", not sec["l"][0], sec["l"])
    check("anonimo: inserimento rifiutato", sec["ins"] is not None, sec["ins"])
    check("token inesistente rifiutato", sec["rpc"] and "non valido" in sec["rpc"], sec["rpc"])
    tamper = A.evaluate("""async ([e,p]) => {
      const c = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.key, {auth:{persistSession:false, storageKey:'y'}});
      await c.auth.signInWithPassword({email:e, password:p});
      const upd = await c.from('visits_audit').update({actor:'falso'}).eq('child','Meryl Test').select();
      const del = await c.from('visits_audit').delete().eq('child','Meryl Test').select();
      return {upd: [upd.data && upd.data.length, upd.error && upd.error.code], del: [del.data && del.data.length, del.error && del.error.code]};
    }""", [EMAIL, PW])
    check("storico non modificabile dal proprietario", not tamper["upd"][0] and not tamper["del"][0], tamper)

    # ── F. link di sola lettura ────────────────────────────────
    A.click("[data-action=open-settings]"); A.wait_for_timeout(300)
    A.click("#shareToggle"); A.wait_for_timeout(800)
    A.fill("#shareLabel", "Collaudo"); A.select_option("#shareDays", "7")
    A.fill("#shareFrom", "2026-11-01"); A.fill("#shareTo", "2026-11-30")
    A.click("#shareCreate"); A.wait_for_timeout(2500)
    d = db(A)
    check("link creato", d["links"] and len(d["links"]) == 1, d.get("links"))
    token = d["links"][0]["token"]
    ctxC, C = mk(None)
    C.goto(URL + "#view=" + token); C.wait_for_timeout(3000)
    banner = C.inner_text("#roBanner")
    check("vista sola lettura: banner", "Sola lettura" in banner and "Collaudo" in banner, banner)
    check("vista sola lettura: impostazioni nascoste", not C.is_visible("[data-action=open-settings]"))
    check("vista sola lettura: giorno 27 singolo visibile", "sing" in day_cell(C, 27).get_attribute("class"))
    day_cell(C, 3).click(); C.wait_for_timeout(300)
    cls = day_cell(C, 3).get_attribute("class")
    check("vista sola lettura: clic non modifica", "pern" not in cls and "sing" not in cls, cls)
    check("vista sola lettura: nulla scritto sul dispositivo", C.evaluate("() => localStorage.getItem('diritti_visita_data_v1')") is None)
    d = db(A)
    check("contatore aperture link", d["links"][0]["use_count"] >= 1, d["links"])
    # revoca
    A.locator("#shareList .btn", has_text="Revoca").first.click(); A.wait_for_timeout(2000)
    C.reload(); C.wait_for_timeout(3000)
    check("link revocato non funziona più", "non è valido" in C.inner_text("#roBanner"), C.inner_text("#roBanner"))

    # ── storico in UI ──────────────────────────────────────────
    A.click("#historyBtn"); A.wait_for_timeout(2000)
    hist = A.inner_text("#historyList")
    check("storico visibile nelle impostazioni", "pernottamento → giorno singolo" in hist, hist[:200])

    # ── logout ─────────────────────────────────────────────────
    A.click("#syncSignOut"); A.wait_for_timeout(1500)
    check("logout: dati locali conservati", "Meryl Test" in A.evaluate("() => localStorage.getItem('diritti_visita_data_v1')"))
    check("logout: badge non collegato", A.get_attribute("#syncBadge", "data-state") == "off")

    real_errors = [e for e in errors if "intruso" not in e and "401" not in e and "400" not in e and "403" not in e and "422" not in e and "500" not in e and "Failed to load resource" not in e and "ERR_INTERNET_DISCONNECTED" not in e]
    check("nessun errore JavaScript", not real_errors, real_errors[:5])
    A.screenshot(path="/tmp/A.png", full_page=True)
    C.screenshot(path="/tmp/C.png")
    browser.close()
srv.terminate()
ok = sum(1 for r in results if r[1]); print(f"\n{ok}/{len(results)} controlli superati")
