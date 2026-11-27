"""Collaudo dell'app con un database simulato (nessun dato reale toccato): note, annulla,
schema, impostazioni, prospetto, sola lettura, recupero password, promemoria, navigazione.
Uso: python3 tests/collaudo_app_simulato.py"""
import json, re, sys, time, subprocess, os, base64, urllib.parse
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); URL = "http://localhost:8790/"
SB = "https://cbsqavoengtdloirtxxz.supabase.co"
UID = "11111111-2222-3333-4444-555555555555"; EMAIL = "prova@example.org"
res = []
def ck(n, c, x=""):
    res.append(c); print(("OK   " if c else "FAIL ") + n + ("" if c else f" -- {x}"), flush=True)

store = {"visits": {}, "notes": {}, "settings": None, "audit": [], "calls": []}
def b64(o): return base64.urlsafe_b64encode(json.dumps(o).encode()).decode().rstrip("=")
TOKEN = b64({"alg":"HS256","typ":"JWT"}) + "." + b64({"sub":UID,"email":EMAIL,"exp":int(time.time())+7200,"role":"authenticated","aud":"authenticated"}) + ".firma"
USER = {"id": UID, "email": EMAIL, "aud": "authenticated", "role": "authenticated"}
SESSION = {"access_token": TOKEN, "token_type": "bearer", "expires_in": 7200, "expires_at": int(time.time())+7200, "refresh_token": "r1", "user": USER}
CORS = {"access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*"}

def parse_in(v):  # in.(a,b)
    v = v[len("in.("):-1]; return [x.strip('"') for x in v.split(",")] if v else []

def handler(route):
    req = route.request; u = urllib.parse.urlparse(req.url); q = urllib.parse.parse_qs(u.query)
    if req.method == "OPTIONS": return route.fulfill(status=204, headers=CORS)
    store["calls"].append((req.method, u.path))
    J = lambda data, st=200: route.fulfill(status=st, headers={**CORS, "content-type": "application/json"}, body=json.dumps(data))
    p = u.path
    if p.startswith("/auth/v1/token"): return J(SESSION)
    if p == "/auth/v1/user":
        if req.method == "PUT": store["newpw"] = (req.post_data_json or {}).get("password"); return J(USER)
        return J(USER)
    if p == "/auth/v1/logout": return route.fulfill(status=204, headers=CORS)
    if p == "/auth/v1/recover": store["recover"] = True; return J({})
    if p == "/rest/v1/rpc/get_shared_calendar":
        vis = [{"child": c, "day": d, "kind": k} for (c, d), k in sorted(store["visits"].items(), key=lambda x: x[0][1])]
        notes = [{"day": d, "note": n} for d, n in sorted(store["notes"].items())]
        return J({"label": "Collaudo", "date_from": None, "date_to": None, "expires_at": "2026-12-31T00:00:00Z",
                  "children": (store["settings"] or {}).get("children", []), "visits": vis, "notes": notes, "generated_at": "2026-11-27T10:00:00Z"})
    m = re.match(r"/rest/v1/(\w+)", p); table = m.group(1) if m else ""
    off = int(q.get("offset", ["0"])[0]); lim = int(q.get("limit", ["100000"])[0])
    accept = req.headers.get("accept", "")
    body = req.post_data_json if req.post_data else None
    if table == "visits":
        if req.method == "GET":
            rows = [{"child": c, "day": d, "kind": k} for (c, d), k in sorted(store["visits"].items(), key=lambda x: (x[0][1], x[0][0]))]
            return J(rows[off:off+lim])
        if req.method == "POST":
            for r in (body if isinstance(body, list) else [body]):
                old = store["visits"].get((r["child"], r["day"]))
                store["visits"][(r["child"], r["day"])] = r["kind"]
                if old != r["kind"]: store["audit"].append({"entity":"visita","child":r["child"],"day":r["day"],"old_kind":old,"new_kind":r["kind"],"changed_at":"2026-11-27T10:00:00Z","actor":EMAIL+" (app)"})
            return route.fulfill(status=201, headers=CORS)
        if req.method == "DELETE":
            child = q["child"][0][3:]; days = parse_in(q["day"][0])
            for d in days:
                old = store["visits"].pop((child, d), None)
                if old: store["audit"].append({"entity":"visita","child":child,"day":d,"old_kind":old,"new_kind":None,"changed_at":"2026-11-27T10:00:00Z","actor":EMAIL+" (app)"})
            return route.fulfill(status=204, headers=CORS)
    if table == "day_notes":
        if req.method == "GET": return J([{"day": d, "note": n} for d, n in sorted(store["notes"].items())][off:off+lim])
        if req.method == "POST":
            for r in (body if isinstance(body, list) else [body]): store["notes"][r["day"]] = r["note"]
            return route.fulfill(status=201, headers=CORS)
        if req.method == "DELETE":
            for d in parse_in(q["day"][0]): store["notes"].pop(d, None)
            return route.fulfill(status=204, headers=CORS)
    if table == "app_settings":
        if req.method == "GET":
            s = store["settings"]
            if "vnd.pgrst.object" in accept:
                if s: return J(s)
                return J({"code": "PGRST116", "details": "The result contains 0 rows", "hint": None, "message": "JSON object requested, multiple (or no) rows returned"}, 406)
            return J([s] if s else [])
        if req.method == "POST": store["settings"] = body if not isinstance(body, list) else body[0]; return route.fulfill(status=201, headers=CORS)
    if table == "visits_audit": return J(list(reversed(store["audit"]))[:100])
    if table == "share_links": return J([])
    return J({"message": "non gestito " + p}, 404)

srv = subprocess.Popen([sys.executable, "-m", "http.server", "8790", "--bind", "127.0.0.1"], cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
SEED = {"profile": {"richiedente": "Diasio Davide", "domicilio": "Agno", "funzionario": "F"}, "children": ["Meryl Test", "Kyan Test"],
        "birthdates": {}, "entries": {"2026-11": {"Meryl Test": {"4": "pern", "5": "sing"}, "Kyan Test": {"4": "pern"}}},
        "notes": {"2026-11-25": "Eccezione chiesta da Meryl"}, "comboMode": False}

with sync_playwright() as p:
    br = p.chromium.launch(headless=True)
    errors = []
    def mk(seed=None, w=412):
        ctx = br.new_context(service_workers="block", viewport={"width": w, "height": 900})
        ctx.route(SB + "/**", handler)
        if seed is not None:
            ctx.add_init_script("if(!localStorage.getItem('diritti_visita_data_v1'))localStorage.setItem('diritti_visita_data_v1', %s);" % json.dumps(json.dumps(seed)))
        ctx.add_init_script("window.print = () => { window.__printed = (window.__printed||0)+1; };")
        pg = ctx.new_page()
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" and "406" not in m.text else None)
        pg.on("dialog", lambda d: d.accept())
        pg.clock.install(time="2026-11-27T10:00:00")
        return ctx, pg
    cell = lambda pg, d: pg.locator("#calGrid .daycell:not(.empty)").nth(d - 1)
    def wait_ok(pg, t=15):
        s = time.time()
        while time.time() - s < t:
            st = pg.evaluate("() => CloudSync.status()")
            if st["state"] == "ok" and st["pending"] == 0: return st
            pg.wait_for_timeout(250)
        return pg.evaluate("() => CloudSync.status()")
    def login(pg):
        pg.click("[data-action=open-settings]"); pg.fill("#syncEmail", EMAIL); pg.fill("#syncPassword", "x" * 14)
        pg.click("#syncSignIn"); st = wait_ok(pg); pg.click("[data-action=close-settings]"); pg.wait_for_timeout(200); return st

    ctxA, A = mk(SEED)
    A.goto(URL); A.wait_for_timeout(1200)
    ck("dati locali esistenti non persi con la nuova versione", "pern" in cell(A, 4).get_attribute("class"))
    ck("nota esistente: segno ✎ sul 25", "has-note" in cell(A, 25).get_attribute("class"))
    ck("note del mese visibili", "Eccezione chiesta da Meryl" in A.inner_text("#notesList"))
    lbl = cell(A, 4).get_attribute("aria-label")
    ck("TalkBack: etichetta del giorno", lbl.startswith("4 novembre 2026") and "pernottamento" in lbl, lbl)
    st = login(A)
    ck("A: sincronizzato", st["state"] == "ok", st)
    ck("DB: nota caricata", store["notes"].get("2026-11-25") == "Eccezione chiesta da Meryl", store["notes"])
    ck("DB: schema salvato nelle impostazioni", store["settings"] and store["settings"].get("schedule", {}).get("ref") == "2026-11-16", store["settings"])

    # nota con pressione lunga
    box = cell(A, 22).bounding_box()
    A.mouse.move(box["x"] + 10, box["y"] + 10); A.mouse.down(); A.wait_for_timeout(750); A.mouse.up(); A.wait_for_timeout(200)
    ck("pressione lunga apre la nota", A.is_visible("#noteModal"))
    ck("pressione lunga non cambia il giorno", "pern" not in cell(A, 22).get_attribute("class"))
    A.fill("#noteText", "Kyan resta anche domenica notte"); A.click("#noteSave"); wait_ok(A)
    ck("DB: nota del 22 salvata", store["notes"].get("2026-11-22") == "Kyan resta anche domenica notte", store["notes"])
    # modalità note e tastiera
    A.click("#notesBtn"); cell(A, 10).click(); A.wait_for_timeout(200)
    ck("modalità ✎ Note: il tocco apre la nota", A.is_visible("#noteModal")); A.click("#noteCancel"); A.click("#notesBtn")
    cell(A, 11).focus(); A.keyboard.press("Enter"); A.wait_for_timeout(200)
    ck("tastiera: Invio segna il giorno", "pern" in cell(A, 11).get_attribute("class"))
    wait_ok(A)
    ck("DB: giorno 11 segnato", store["visits"].get(("Meryl Test", "2026-11-11")) == "pern")
    # annulla
    cell(A, 12).click(); A.wait_for_timeout(200)
    ck("barra Annulla visibile", A.is_visible("#undoBar"))
    A.click("#undoBtn"); A.wait_for_timeout(200)
    ck("Annulla ripristina il giorno", "pern" not in cell(A, 12).get_attribute("class"))
    wait_ok(A)
    ck("DB: giorno 12 non presente dopo Annulla", ("Meryl Test", "2026-11-12") not in store["visits"], store["visits"])

    # impostazioni: chiudere senza salvare annulla l'aggiunta di un figlio
    A.click("[data-action=open-settings]"); A.click("[data-action=add-child]"); A.click("[data-action=close-settings]"); A.wait_for_timeout(200)
    ck("Chiudi senza salvare non aggiunge figli", A.evaluate("DATA.children.length") == 2, A.evaluate("DATA.children"))

    # secondo dispositivo
    ctxB, B = mk(None)
    B.goto(URL); B.wait_for_timeout(1000); login(B)
    ck("B: figli scaricati", "Meryl Test" in B.inner_text("#childSegCal"), (store["settings"], B.evaluate("DATA.children"), [c for c in store["calls"] if "settings" in c[1]]))
    ck("B: note scaricate", "Kyan resta anche domenica notte" in B.inner_text("#notesList"))
    # schema su dicembre
    B.click("[data-action=next-month]"); B.wait_for_timeout(200)
    B.click("#scheduleApply"); B.wait_for_timeout(300)
    # dic 2026: settimana A = 14 dic (ref 16 nov + 4 sett.) → lun 14 pern, mar 15 sing, ven 18 pern, sab 19 pern, dom 20 sing
    ck("schema: lun 14 dicembre pernottamento", "pern" in cell(B, 14).get_attribute("class"))
    ck("schema: mer 9 dicembre (sett. B) pernottamento", "pern" in cell(B, 9).get_attribute("class"))
    ck("schema: mer 16 dicembre (sett. A) vuoto", "pern" not in cell(B, 16).get_attribute("class"))
    wait_ok(B)
    dec = [k for k in store["visits"] if k[1].startswith("2026-12")]
    ck("DB: giorni di dicembre per entrambi i figli", len(dec) > 10 and {c for c, _ in dec} == {"Meryl Test", "Kyan Test"}, len(dec))
    # A riceve
    A.evaluate("CloudSync.syncNow()"); A.wait_for_timeout(1500)
    A.click("[data-action=next-month]"); A.wait_for_timeout(200)
    ck("A riceve lo schema di dicembre", "pern" in cell(A, 14).get_attribute("class"))
    A.click("[data-action=prev-month]")

    # storico con note
    A.click("[data-action=open-settings]"); A.click("#historyBtn"); A.wait_for_timeout(800)
    ck("storico leggibile", "pernottamento" in A.inner_text("#historyList"))
    A.click("[data-action=close-settings]")

    # prospetto
    A.click("[data-tab=summary]"); A.click("#reportBtn"); A.wait_for_timeout(300)
    txt = A.inner_text("#printArea") if A.evaluate("document.body.classList.contains('printing')") else A.evaluate("document.getElementById('printArea').textContent")
    ck("prospetto generato e stampa avviata", A.evaluate("window.__printed") == 1)
    ck("prospetto: dettaglio e note", "Kyan resta anche domenica notte" in txt and "Dettaglio dei giorni" in txt and "Totale anno" in txt, txt[:300])

    # sola lettura con note
    ctxC, C = mk(None)
    C.goto(URL + "#view=12345678-1234-1234-1234-123456789abc"); C.wait_for_timeout(1500)
    ck("sola lettura: note visibili", "Eccezione chiesta da Meryl" in C.inner_text("#notesList"))
    ck("sola lettura: Prospetto disponibile", (C.click("[data-tab=summary]") or True) and C.is_visible("#reportBtn"))
    C.click("[data-tab=calendar]"); box = cell(C, 3).bounding_box()
    C.mouse.move(box["x"] + 5, box["y"] + 5); C.mouse.down(); C.wait_for_timeout(700); C.mouse.up()
    ck("sola lettura: pressione lunga non apre note", not C.is_visible("#noteModal"))

    # recupero password
    ctxD, D = mk(None)
    D.goto(URL + "#access_token=" + TOKEN + "&expires_in=3600&refresh_token=r2&token_type=bearer&type=recovery"); D.wait_for_timeout(2000)
    ck("link e-mail: riquadro nuova password", D.is_visible("#pwResetBox"))
    ck("link e-mail: token tolto dall'indirizzo", "access_token" not in D.url, D.url)
    D.fill("#newPassword", "NuovaPassword-2026"); D.click("#pwResetSave"); D.wait_for_timeout(800)
    ck("nuova password inviata", store.get("newpw") == "NuovaPassword-2026")
    D.goto(URL); D.wait_for_timeout(800)
    D.click("[data-action=open-settings]"); D.click("#syncSignOut"); D.wait_for_timeout(500)
    D.fill("#syncEmail", EMAIL); D.click("#syncForgot"); D.wait_for_timeout(600)
    ck("Password dimenticata invia l'e-mail", store.get("recover") is True)

    ctxE, E = mk(None)
    E.goto(URL); E.wait_for_timeout(800)
    E.click("[data-action=open-settings]"); E.fill("#syncEmail", EMAIL); E.fill("#syncPassword", "x" * 14); E.click("#syncSignIn")
    wait_ok(E); E.wait_for_timeout(300)
    names = E.evaluate("[...document.querySelectorAll('#childList .child-name')].map(i=>i.value)")
    ck("Impostazioni aperte durante l'accesso: modulo aggiornato", names == ["Meryl Test", "Kyan Test"], names)
    E.click("[data-action=save-settings]"); wait_ok(E)
    ck("Salva subito dopo l'accesso non sovrascrive i figli", store["settings"]["children"] == ["Meryl Test", "Kyan Test"], store["settings"]["children"])
    # navigazione e tasto indietro ancora funzionanti
    E.click("[data-tab=summary]"); E.go_back(); E.wait_for_timeout(200)
    ck("tasto Indietro torna al Calendario", E.evaluate("currentTab()") == "calendar")
    ck("27 novembre: nessun promemoria", not A.is_visible("#reminderBar"))
    ctxF, F = mk(SEED)
    F.clock.install(time="2026-11-29T09:00:00") if False else None
    F.close(); ctxF.close()
    ctxF = br.new_context(service_workers="block"); F = ctxF.new_page(); F.clock.install(time="2026-12-02T09:00:00")
    F.on("pageerror", lambda e: errors.append(str(e)))
    F.goto(URL); F.wait_for_timeout(800)
    ck("2 dicembre: promemoria moduli di novembre", F.is_visible("#reminderBar") and "novembre 2026" in F.inner_text("#reminderText"))
    F.click("#reminderGo"); F.wait_for_timeout(200)
    ck("Vai ai moduli: scheda Moduli su novembre", F.evaluate("currentTab()") == "generate" and "Novembre 2026" in F.inner_text("#monthLabelGen"))
    F.click("#reminderDone"); F.reload(); F.wait_for_timeout(800)
    ck("Fatto: il promemoria non ricompare", not F.is_visible("#reminderBar"))
    ck("nessun errore JavaScript", not errors, errors[:5])
    br.close()
srv.terminate()
print(f"\n{sum(res)}/{len(res)} controlli superati")
