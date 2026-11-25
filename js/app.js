(() => {
  "use strict";
  const MF = window.MF;
  const { $, h, btn, shuffle, fold, check, toast, store, today, tex, rich, gapAnswers, plain, Speech } = MF;

  const MODS = [
    { id: "terms", file: "data/terms-optimization.json", emoji: "📖" },
    { id: "symbols", file: "data/symbols.json", emoji: "∑" },
    { id: "phrases", file: "data/phrases.json", emoji: "✍️" },
  ];
  const PREFIX = { terms: "t", symbols: "s", phrases: "p" };
  const MIN = 60000, DAY = 86400000;
  const INTERVAL = { 1: 10 * MIN, 2: DAY, 3: 3 * DAY, 4: 7 * DAY, 5: 15 * DAY };
  const MASTER = 30 * DAY;
  const REVIEW_BATCH = 15;

  // ---- state ------------------------------------------------------------------------
  let D = null;                 // { mods: { terms: { topics } , … } }
  const ITEMS = {};             // key -> item (with .key .mod .topic)
  const BY_MOD = {};            // mod -> [keys]
  const BY_TOPIC = {};          // mod/topic -> [keys]
  let ALL = [];
  let tok = 0;
  const CANCEL = { cancelled: true };
  const alive = (my) => { if (my !== tok) throw CANCEL; };

  let prog = store.get("prog", {});
  let done = store.get("done", {});
  let log = store.get("log", {});
  let flags = store.get("flags", {});
  const settings = Object.assign({ goal: 10, unlockAll: false, autoplay: true, lang: "vi" }, store.get("set", {}));
  const saveProg = () => { store.set("prog", prog); refreshBadge(); };
  const saveDone = () => store.set("done", done);
  const saveSet = () => store.set("set", settings);
  const saveFlags = () => store.set("flags", flags);

  const LANGS = window.MF_LANG;
  if (!LANGS[settings.lang]) settings.lang = "vi";
  let T = LANGS[settings.lang];
  const EN = () => settings.lang === "en";
  const L = (pair) => (Array.isArray(pair) ? (EN() ? pair[1] || pair[0] : pair[0]) : pair);

  // ---- speech of formulas ------------------------------------------------------------
  // A rough spoken form of LaTeX, good enough to hear example sentences read aloud.
  const GREEK = "alpha|beta|gamma|delta|varepsilon|epsilon|lambda|mu|sigma|theta|iota|rho|tau|varphi|phi|psi|omega|xi|eta|kappa|nu|pi";
  function speakTex(s) {
    return " " + s
      .replace(/([A-Za-z}*'])\(/g, "$1 of (")
      .replace(/\\mathbb\{R\}\^n/g, " R n ").replace(/\\mathbb\{(\w)\}/g, " $1 ")
      .replace(/\\(?:operatorname|mathrm|text)\{([^}]*)\}/g, " $1 ").replace(/\\mathop\{\\mathrm\{([^}]*)\}\}/g, " $1 ")
      .replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, " $1 over $2 ")
      .replace(/\\\|([^|]*?)\\\|/g, " the norm of $1 ").replace(/\|([^|]*?)\|/g, " the absolute value of $1 ")
      .replace(/\\langle(.*?)\\rangle/g, " the inner product of $1 ")
      .replace(/\\(bar|hat|tilde)\s*\{?\s*(\w)\s*\}?/g, " $2 $1 ")
      .replace(/\^\{?\*\}?/g, " star ").replace(/\^\{?\\top\}?/g, " transpose ").replace(/\^\{-1\}/g, " inverse ")
      .replace(/\^2(?!\d)/g, " squared ").replace(/\^\{?([\w+-]+)\}?/g, " $1 ").replace(/_\{?([\w+-]+)\}?/g, " $1 ")
      .replace(/\\nabla/g, " nabla ").replace(/\\partial/g, " partial ")
      .replace(/\\leq?(?![a-z])/g, " less than or equal to ").replace(/\\geq?(?![a-z])/g, " greater than or equal to ")
      .replace(/\\neq?(?![a-z])/g, " not equal to ").replace(/\\notin/g, " not in ").replace(/\\in(?![a-z])/g, " in ")
      .replace(/\\rightharpoonup/g, " converges weakly to ").replace(/\\to(?![a-z])/g, " tends to ").replace(/\\downarrow/g, " decreases to ")
      .replace(/\\infty/g, " infinity ").replace(new RegExp("\\\\(" + GREEK + ")", "g"), (m, g) => " " + g.replace(/^var/, "") + " ")
      .replace(/\\(min|max|inf|sup|lim|liminf|limsup|dom|epi|prox|dist)\b/g, " $1 ")
      .replace(/\\[a-zA-Z]+/g, " ").replace(/</g, " less than ").replace(/>/g, " greater than ").replace(/=/g, " equals ")
      .replace(/\+/g, " plus ").replace(/-/g, " minus ").replace(/\//g, " over ").replace(/[{}()\[\]\\,;:.]/g, " ") + " ";
  }
  const spoken = (text) => String(text || "").replace(/\$\$([^$]+)\$\$|\$([^$]+)\$/g, (m, a, b) => speakTex(a || b));
  const speak = (text, opts) => Speech.say(plain(spoken(text)), opts);
  const say = (text, slowToo = true) => h("span", { class: "say" },
    btn("🔊", (e) => { e.stopPropagation(); speak(text); }, "icon-btn", T.say),
    slowToo ? btn("🐢", (e) => { e.stopPropagation(); speak(text, { slow: true }); }, "icon-btn", T.slow) : null);
  const sayLater = (text, ms = 250) => { const my = tok; setTimeout(() => { if (my === tok) speak(text); }, ms); };

  // ---- item helpers -----------------------------------------------------------------
  const sayOf = (it) => (it.mod === "terms" ? it.en : it.mod === "symbols" ? it.read : it.ex[0]);
  const meanOf = (it) => (it.mod === "terms" ? (EN() ? it.gloss : it.vi) : it.mod === "symbols" ? (EN() ? it.read : it.vi) : L(it.fn));
  const labelOf = (it) => (it.mod === "terms" ? h("span", { lang: "en" }, it.en) : it.mod === "symbols" ? tex(it.tex) : rich(it.en));
  const searchText = (it) => fold([it.en, it.vi, it.gloss, it.read, (it.alt || []).join(" "), it.fn && it.fn.join(" "), it.ex && plain(it.ex.join(" "), true), it.tex].filter(Boolean).join(" "));
  const POS = { n: ["danh từ", "noun"], v: ["động từ", "verb"], adj: ["tính từ", "adjective"] };
  const draftTag = (it) => (it.ok ? null : h("span", { class: "tag draft", title: T.draftTitle }, T.draft));

  function applyChrome() {
    document.documentElement.lang = T.htmlLang;
    document.title = T.pageTitle;
    document.querySelectorAll("[data-t]").forEach((el) => { el.textContent = T[el.dataset.t]; });
    document.querySelectorAll("[data-t-title]").forEach((el) => { el.title = T[el.dataset.tTitle]; el.setAttribute("aria-label", T[el.dataset.tTitle]); });
  }
  function setLang(lang) {
    if (!LANGS[lang] || lang === settings.lang) return;
    if (document.querySelector(".stage .q") && !confirm(T.exitLesson)) return;
    settings.lang = lang;
    T = LANGS[lang];
    saveSet();
    applyChrome();
    route();
  }

  // ---- spaced review ----------------------------------------------------------------
  function bump(field, n = 1) {
    const d = (log[today()] = log[today()] || { n: 0, r: 0 });
    d[field] = (d[field] || 0) + n;
    store.set("log", log);
  }
  const lvOf = (k) => (prog[k] ? prog[k].lv : 0);
  function learn(keys) {
    let fresh = 0;
    const now = Date.now();
    for (const k of keys) if (!prog[k]) { prog[k] = { lv: 1, due: now + INTERVAL[1], n: 0, w: 0, t: now }; fresh++; }
    saveProg();
    return fresh;
  }
  function grade(k, ok) {
    const p = prog[k];
    if (!p) return;
    const now = Date.now();
    p.n = (p.n || 0) + 1;
    if (ok) { if (p.lv >= 5) p.due = now + MASTER; else { p.lv++; p.due = now + INTERVAL[p.lv]; } }
    else { p.w = (p.w || 0) + 1; p.lv = Math.max(1, p.lv - 2); p.due = now + INTERVAL[1]; }
    saveProg();
  }
  function noteWrong(k) { if (prog[k]) { prog[k].w = (prog[k].w || 0) + 1; saveProg(); } }
  const known = (k) => Boolean(ITEMS[k]);
  const dueKeys = () => Object.keys(prog).filter((k) => known(k) && prog[k].due <= Date.now()).sort((a, b) => prog[a].due - prog[b].due);
  const hardKeys = () => Object.keys(prog).filter((k) => known(k) && (prog[k].w || 0) >= 2 && prog[k].lv <= 3).sort((a, b) => prog[b].w - prog[a].w);
  const starKeys = () => Object.keys(prog).filter((k) => known(k) && prog[k].star);
  const flagKeys = () => Object.keys(flags).filter((k) => known(k) && flags[k] && flags[k].note);
  function streak() {
    let n = 0;
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    const pad = (x) => String(x).padStart(2, "0");
    const day = (x) => x.getFullYear() + "-" + pad(x.getMonth() + 1) + "-" + pad(x.getDate());
    const active = (x) => { const e = log[day(x)]; return e && (e.n || 0) + (e.r || 0) > 0; };
    if (!active(d)) d.setDate(d.getDate() - 1);
    while (active(d)) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function refreshBadge() {
    const b = $("#due-badge");
    if (!b || !D) return;
    const n = dueKeys().length;
    b.hidden = n === 0;
    b.textContent = n > 99 ? "99+" : n;
  }
  function untilText(ms) {
    if (ms < 90 * MIN) return T.min(Math.max(1, Math.round(ms / MIN)));
    if (ms < 36 * 3600000) return T.hour(Math.round(ms / 3600000));
    return T.day(Math.round(ms / DAY));
  }

  // ---- structure --------------------------------------------------------------------
  const modOf = (id) => MODS.find((m) => m.id === id);
  const topicsOf = (mod) => D.mods[mod].topics;
  const topicOf = (mod, tid) => topicsOf(mod).find((t) => t.id === tid);
  const lessonOf = (mod, tid, n) => { const t = D.mods[mod] && topicOf(mod, tid); return t ? { t, l: t.lessons[n - 1] } : null; };
  const unlocked = (t, l) => settings.unlockAll || l.n === 1 || Boolean(done[t.lessons[l.n - 2].id]);
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const bar = (p) => h("div", { class: "bar-prog" }, h("span", { style: "width:" + Math.min(100, p) + "%" }));
  const lvDots = (lv) => h("span", { class: "lv", title: T.lv[lv], "aria-label": T.lv[lv] }, [1, 2, 3, 4, 5].map((i) => h("i", { class: i <= lv ? "on l" + lv : "" })));
  const mount = (...kids) => { $("#app").replaceChildren(...kids.flat().filter(Boolean)); window.scrollTo({ top: 0 }); };
  const stats = (keys) => { let seen = 0, solid = 0; for (const k of keys) { const v = lvOf(k); if (v) seen++; if (v >= 4) solid++; } return { seen, solid, total: keys.length }; };
  const modTitle = (mod) => T.mods[mod][0];
  const tTitle = (t) => (EN() ? t.titleEn : t.title);
  const tDesc = (t) => (EN() ? t.descEn : t.desc);
  function chunk(keys) {
    if (keys.length <= 9) return [keys];
    const parts = Math.ceil(keys.length / 8), size = Math.ceil(keys.length / parts), out = [];
    for (let i = 0; i < keys.length; i += size) out.push(keys.slice(i, i + size));
    return out;
  }

  // ---- cards ------------------------------------------------------------------------
  const sec = (title, ...kids) => h("div", { class: "sec" }, h("div", { class: "sec-t" }, title), ...kids);
  const noteBox = (it) => (it.note ? h("div", { class: "why" }, "💡 ", rich(L(it.note))) : null);
  function exBox(ex) {
    return h("div", { class: "ex" },
      h("div", { class: "ex-en", lang: "en" }, rich(ex[0]), " ", say(ex[0], false)),
      EN() ? null : h("div", { class: "ex-vi", lang: "vi" }, rich(ex[1])));
  }
  function termCard(it) {
    return h("div", { class: "card" },
      h("div", { class: "card-top" }, h("span", { class: "big", lang: "en" }, it.en), say(it.en)),
      h("div", { class: "sub" }, L(POS[it.pos] || [it.pos]), it.ipa ? h("span", { class: "ipa" }, " · " + it.ipa) : null),
      h("div", { class: "mean" }, EN() ? it.gloss : it.vi),
      EN() ? null : h("div", { class: "sub", lang: "en" }, it.gloss),
      h("div", { class: "card-body" },
        sec(T.secDef, h("div", { class: "def", lang: "en" }, rich(it.def), " ", say(it.def, false))),
        it.col && it.col.length ? sec(T.secCol, h("ul", { class: "cols" }, it.col.map((c) =>
          h("li", {}, h("span", { lang: "en" }, rich(c[0])), " ", say(c[0], false), EN() ? null : h("span", { class: "muted small", lang: "vi" }, " — ", rich(c[1])))))) : null,
        it.family && it.family.length ? sec(T.secFamily, h("div", { class: "fam" }, it.family.map((f) =>
          h("span", { class: "chip static" }, h("b", { lang: "en" }, f[0]), " ", h("span", { class: "muted small" }, f[1]), EN() ? null : h("span", { class: "small" }, " · ", rich(f[2])))))) : null,
        sec(T.secEx, exBox(it.ex)),
        noteBox(it)),
      h("div", { class: "tags" }, h("span", { class: "tag" }, "Optimization"), draftTag(it)));
  }
  function symCard(it) {
    return h("div", { class: "card" },
      h("div", { class: "sym-big" }, tex(it.tex, true)),
      h("div", { class: "card-top" }, h("span", { class: "read", lang: "en" }, it.read), say(it.read)),
      EN() ? null : h("div", { class: "mean small-mean", lang: "vi" }, it.vi),
      h("div", { class: "card-body" },
        it.alt && it.alt.length ? sec(T.secAlt, h("ul", { class: "cols" }, it.alt.map((a) => h("li", { lang: "en" }, a, " ", say(a, false))))) : null,
        noteBox(it)),
      h("div", { class: "tags" }, draftTag(it)));
  }
  function phrCard(it) {
    return h("div", { class: "card" },
      h("div", { class: "sub" }, T.secUse, ": ", h("b", {}, L(it.fn))),
      h("div", { class: "card-top" }, h("span", { class: "big phr", lang: "en" }, rich(it.en))),
      EN() ? null : h("div", { class: "sub", lang: "vi" }, rich(it.vi)),
      h("div", { class: "card-body" },
        sec(T.secEx, exBox(it.ex)),
        it.wrong && it.wrong.length ? sec(T.secWrong, h("ul", { class: "wrong" }, it.wrong.map((w) => h("li", { lang: "en" }, "✗ ", rich(w))))) : null,
        noteBox(it)),
      h("div", { class: "tags" }, draftTag(it)));
  }
  const cardOf = (it) => (it.mod === "terms" ? termCard(it) : it.mod === "symbols" ? symCard(it) : phrCard(it));
  function reveal(it) {
    if (it.mod === "terms") return h("div", { class: "reveal" }, h("div", { class: "reveal-top" }, h("b", { lang: "en" }, it.en), " ", say(it.en, false)), h("div", { class: "muted" }, meanOf(it)));
    if (it.mod === "symbols") return h("div", { class: "reveal" }, h("div", { class: "reveal-top" }, tex(it.tex), h("b", { lang: "en" }, " — " + it.read), " ", say(it.read, false)), EN() ? null : h("div", { class: "muted" }, it.vi));
    return h("div", { class: "reveal" }, h("div", { class: "reveal-top", lang: "en" }, rich(it.ex[0]), " ", say(it.ex[0], false)), EN() ? null : h("div", { class: "muted", lang: "vi" }, rich(it.ex[1])));
  }

  function starBtn(k) {
    const p = prog[k];
    const b = btn(p && p.star ? "★" : "☆", () => {
      if (!prog[k]) { toast(T.starFirst); return; }
      prog[k].star = prog[k].star ? 0 : 1;
      saveProg();
      b.textContent = prog[k].star ? "★" : "☆";
      b.classList.toggle("on", Boolean(prog[k].star));
    }, "icon-btn tiny star" + (p && p.star ? " on" : ""), T.starTitle);
    return b;
  }
  function flagBtn(k, after) {
    const on = () => Boolean(flags[k] && flags[k].note);
    const b = btn("🚩", () => {
      const v = prompt(T.flagAsk, on() ? flags[k].note : "");
      if (v === null) return;
      flags[k] = { note: v.trim(), at: Date.now() };
      saveFlags();
      toast(v.trim() ? T.flagged : T.unflagged);
      b.classList.toggle("on", on());
      if (after) after();
    }, "icon-btn tiny flag" + (on() ? " on" : ""), T.flagTitle);
    return b;
  }
  function row(k, opts = {}) {
    const it = ITEMS[k];
    const f = flags[k] && flags[k].note;
    return h("div", { class: "row" },
      h("a", { class: "row-main", href: "#/i/" + encodeURIComponent(k) },
        h("div", { class: "row-label" }, labelOf(it)),
        h("div", { class: "row-sub muted" }, it.mod === "symbols" && !EN() ? it.read + " · " + it.vi : meanOf(it)),
        opts.topic ? h("span", { class: "tag" }, modTitle(it.mod) + " · " + tTitle(topicOf(it.mod, it.topic))) : null,
        f ? h("div", { class: "row-flag small" }, "🚩 " + f) : null),
      h("div", { class: "row-act" }, lvDots(lvOf(k)), say(sayOf(it), false), starBtn(k), flagBtn(k, opts.onFlag)));
  }

  // ---- pages ------------------------------------------------------------------------
  function nextLesson() {
    const last = Object.entries(done).sort((a, b) => b[1].at - a[1].at)[0];
    if (last) {
      const [mod, tid, n] = last[0].split(".");
      const f = lessonOf(mod, tid, Number(n));
      if (f && f.t.lessons[Number(n)] && !done[f.t.lessons[Number(n)].id]) return { mod, t: f.t, l: f.t.lessons[Number(n)] };
      if (D.mods[mod]) for (const t of topicsOf(mod)) { const l = t.lessons.find((x) => !done[x.id] && unlocked(t, x)); if (l) return { mod, t, l }; }
    }
    for (const m of MODS) for (const t of topicsOf(m.id)) { const l = t.lessons.find((x) => !done[x.id] && unlocked(t, x)); if (l) return { mod: m.id, t, l }; }
    return null;
  }
  function home() {
    const nDue = dueKeys().length;
    const todayN = (log[today()] || {}).n || 0;
    const knownN = ALL.filter((k) => lvOf(k)).length;
    const next = nextLesson();
    const stat = (emoji, val, label, p) => h("div", { class: "stat" }, h("div", { class: "stat-top" }, h("span", { "aria-hidden": "true" }, emoji), h("b", {}, String(val))), h("div", { class: "small muted" }, label), p != null ? bar(p) : null);
    mount(
      h("section", { class: "hero" },
        h("h1", {}, T.heroTitle), h("p", { class: "lead" }, T.tagline), h("p", { class: "muted" }, T.heroText),
        h("div", { class: "stats" },
          stat("🔥", streak(), T.statStreak),
          stat("🎯", todayN + "/" + settings.goal, T.statToday, pct(todayN, settings.goal)),
          stat("🔁", nDue, T.statDue),
          stat("📚", knownN + "/" + ALL.length, T.statKnown, pct(knownN, ALL.length))),
        h("div", { class: "actions" },
          nDue ? h("a", { class: "btn big", href: "#/review" }, T.reviewN(nDue)) : null,
          next ? h("a", { class: "btn big" + (nDue ? " ghost" : ""), href: lessonHref(next.mod, next.t, next.l) }, T.continueAt(modTitle(next.mod), tTitle(next.t), next.l.n)) : null)),
      h("div", { class: "grid" }, MODS.map((m) => {
        const s = stats(BY_MOD[m.id]);
        const ls = topicsOf(m.id).flatMap((t) => t.lessons);
        return h("a", { class: "tile", href: "#/m/" + m.id },
          h("div", { class: "tile-top" }, h("span", { class: "tile-emo", "aria-hidden": "true" }, m.emoji), h("span", { class: "pill" }, T.lessonsDone(ls.filter((l) => done[l.id]).length, ls.length))),
          h("h3", {}, modTitle(m.id)), h("p", { class: "small muted" }, T.mods[m.id][1]),
          bar(pct(s.seen, s.total)), h("div", { class: "small muted" }, T.modLine(s.seen, s.total, s.solid)));
      })),
      h("p", { class: "draft-note small" }, T.draftNote));
  }
  const lessonHref = (mod, t, l) => "#/l/" + mod + "/" + t.id + "/" + l.n;

  function modPage(mod) {
    if (!D.mods[mod]) return notFound();
    const m = modOf(mod);
    const s = stats(BY_MOD[mod]);
    mount(
      h("p", { class: "crumb" }, h("a", { href: "#/" }, T.allModules)),
      h("section", { class: "hero slim" }, h("h1", {}, m.emoji + " " + modTitle(mod)), h("p", { class: "muted" }, T.mods[mod][1]), bar(pct(s.seen, s.total)), h("div", { class: "small muted" }, T.modLine(s.seen, s.total, s.solid))),
      topicsOf(mod).map((t) => {
        const ts = stats(BY_TOPIC[mod + "/" + t.id]);
        return h("section", { class: "topic" },
          h("div", { class: "topic-head" }, h("span", { class: "topic-emo", "aria-hidden": "true" }, t.emoji),
            h("div", {}, h("h2", {}, tTitle(t)), h("p", { class: "small muted" }, tDesc(t)), h("div", { class: "small muted" }, T.modLine(ts.seen, ts.total, ts.solid)))),
          h("div", { class: "lessons" }, t.lessons.map((l) => {
            const open = unlocked(t, l), d = done[l.id];
            const preview = l.keys.slice(0, 4).map((k) => plain(ITEMS[k].en || ITEMS[k].read)).join(" · ") + (l.keys.length > 4 ? " …" : "");
            return h("div", { class: "lesson" + (open ? "" : " locked") + (d ? " done" : "") },
              h("div", { class: "lesson-n" }, d ? "✓" : open ? String(l.n) : "🔒"),
              h("div", { class: "lesson-body" }, h("h3", {}, T.lesson(l.n), h("span", { class: "muted small" }, " · " + T.nItems(l.keys.length, T.unit[mod]))),
                h("p", { class: "small muted", lang: "en" }, open ? preview : T.finishFirst(l.n - 1)),
                d ? h("div", { class: "small" }, T.lastTime(d.acc)) : null),
              open ? h("a", { class: "btn" + (d ? " ghost" : ""), href: lessonHref(mod, t, l) }, d ? T.redo : T.learnBtn) : null);
          })));
      }));
  }

  function itemPage(key) {
    const it = ITEMS[key];
    if (!it) return notFound();
    mount(h("p", { class: "crumb" }, h("a", { href: "#/m/" + it.mod }, "← " + modTitle(it.mod) + " · " + tTitle(topicOf(it.mod, it.topic)))),
      h("div", { class: "stage" }, cardOf(it), h("div", { class: "actions center" }, lvDots(lvOf(key)), starBtn(key), flagBtn(key, () => itemPage(key))),
        flags[key] && flags[key].note ? h("p", { class: "row-flag center" }, "🚩 " + flags[key].note) : null));
  }

  // ---- exercise machinery -----------------------------------------------------------
  function makeStage(title, onExit) {
    const fill = h("span", { class: "prog-fill" });
    const label = h("span", { class: "prog-label small muted" });
    const q = h("div", { class: "q" });
    const el = h("div", { class: "stage" },
      h("div", { class: "stage-bar" }, btn("✕", onExit, "icon-btn", T.exit), h("div", { class: "prog" }, fill), label),
      h("div", { class: "stage-title muted small" }, title), q);
    return {
      el,
      set(a, b) { fill.style.width = pct(a, b) + "%"; label.textContent = a + "/" + b; },
      show(...kids) { q.replaceChildren(...kids.flat().filter(Boolean)); window.scrollTo({ top: 0 }); },
    };
  }
  function keyHandler(map) {
    const my = tok;
    const fn = (e) => {
      if (my !== tok) { document.removeEventListener("keydown", fn); return; }
      if (e.target && /^(input|textarea|select)$/i.test(e.target.tagName) && e.key !== "Enter") return;
      const f = map[e.key];
      if (f) { e.preventDefault(); f(); }
    };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }
  // After a right answer: read the answer aloud, then move on by itself.
  function autoNext(it, finish) {
    const my = tok, t0 = Date.now();
    speak(sayOf(it)).then(() => { if (my === tok) setTimeout(() => { if (my === tok) finish(); }, Math.max(1200, 3200 - (Date.now() - t0))); });
  }
  const cap = (text) => h("div", { class: "cap" }, text);
  const listenBox = (text) => h("div", { class: "listen" }, btn(T.listen, () => speak(text), "btn big"), btn("🐢", () => speak(text, { slow: true }), "icon-btn", T.slow));

  function mcQ(st, o) {
    return new Promise((res) => {
      let locked = false, off = null, ended = false;
      const fb = h("div", { class: "fb", hidden: true });
      const opts = o.options.map((op, i) => {
        const b = h("button", { type: "button", class: "opt", onclick: () => pick(b, op) }, h("span", { class: "opt-n" }, String(i + 1)), h("span", { class: "opt-t" }, op.node));
        b._val = op.val;
        return b;
      });
      function finish(ok) { if (ended) return; ended = true; if (off) off(); res(ok); }
      function pick(b, op) {
        if (locked) return;
        locked = true;
        const ok = op.val === o.correct;
        b.classList.add(ok ? "ok" : "bad");
        if (!ok) opts.find((x) => x._val === o.correct).classList.add("ok");
        fb.hidden = false;
        fb.className = "fb " + (ok ? "good" : "miss");
        fb.replaceChildren(h("div", { class: "fb-title" }, ok ? T.correct : T.wrong), reveal(o.it), o.extra || null, btn(T.next, () => finish(ok), "btn"));
        if (ok) autoNext(o.it, () => finish(true)); else speak(sayOf(o.it));
      }
      const map = { Enter: () => { if (locked) finish(fb.classList.contains("good")); } };
      opts.forEach((b, i) => { map[String(i + 1)] = () => b.click(); });
      off = keyHandler(map);
      st.show(h("div", { class: "prompt" }, o.head), o.say ? listenBox(o.say) : null, h("div", { class: "opts" + (o.cols ? " cols" : "") }, opts), fb);
      if (o.say) sayLater(o.say);
    });
  }

  function typeQ(st, o) {
    return new Promise((res) => {
      let off = null, hinted = false, locked = false, ended = false;
      const input = h("input", { type: "text", class: "input", lang: "en", autocomplete: "off", autocapitalize: "none", spellcheck: "false", "aria-label": T.typePh, placeholder: T.typePh });
      const fb = h("div", { class: "fb", hidden: true });
      const hintBox = h("div", { class: "hint small muted" });
      const go = btn(T.check, submit, "btn");
      const hintBtn = btn(T.hint, () => { hinted = true; const a = o.answers[0]; hintBox.textContent = T.hintText(a.slice(0, Math.min(2, a.length)), a.length); input.focus(); }, "btn ghost small");
      const skip = btn(T.dontKnow, () => end(false, null), "btn ghost small");
      function finish(ok) { if (ended) return; ended = true; if (off) off(); res(ok); }
      function end(ok, r) {
        if (locked) return;
        locked = true;
        [input, go, hintBtn, skip].forEach((x) => { x.disabled = true; });
        const good = ok && !hinted;
        const others = o.answers.slice(1).filter((a) => !r || a !== r.answer);
        fb.hidden = false;
        fb.className = "fb " + (good ? "good" : "miss");
        fb.replaceChildren(...[
          h("div", { class: "fb-title" }, ok ? (hinted ? T.okHinted : r.typo ? T.okTypo(r.answer) : T.correct) : r ? T.wrongAnswerIs : T.answerIs),
          ok ? null : h("div", { class: "answer", lang: "en" }, o.answers[0]),
          others.length ? h("div", { class: "small muted" }, T.accepted, others.join(" · ")) : null,
          o.after ? o.after() : reveal(o.it), btn(T.next, () => finish(good), "btn")].filter(Boolean));
        if (good) autoNext(o.it, () => finish(true)); else speak(sayOf(o.it));
      }
      function submit() {
        if (locked || !input.value.trim()) return;
        const r = check(input.value, o.answers);
        end(r.ok, r);
      }
      off = keyHandler({ Enter: () => { if (locked) finish(fb.classList.contains("good")); else submit(); } });
      st.show(h("div", { class: "prompt" }, o.head), o.say ? listenBox(o.say) : null, input, h("div", { class: "actions" }, go, hintBtn, skip), hintBox, fb);
      setTimeout(() => input.focus(), 50);
      if (o.say) sayLater(o.say);
    });
  }

  function selfQ(st, o) {
    return new Promise((res) => {
      let off = null, shown = false, ended = false;
      const area = h("div", { class: "self" });
      function finish(ok) { if (ended) return; ended = true; if (off) off(); res(ok); }
      const okB = btn(T.selfOk, () => finish(true), "btn good-btn"), badB = btn(T.selfBad, () => finish(false), "btn bad-btn");
      function show() {
        if (shown) return;
        shown = true;
        area.replaceChildren(h("div", { class: "fb good-soft" }, reveal(o.it)), h("div", { class: "actions center" }, okB, badB));
        speak(sayOf(o.it));
      }
      area.append(h("div", { class: "actions center" }, btn(T.showAnswer, show, "btn big")));
      off = keyHandler({ " ": () => (shown ? null : show()), Enter: () => (shown ? null : show()), "1": () => shown && finish(true), "2": () => shown && finish(false) });
      st.show(h("div", { class: "prompt" }, o.head), area, h("p", { class: "small muted center" }, T.selfHint));
    });
  }

  function distractors(it, n, get, pool) {
    const seen = new Set([fold(plain(get(it), true))]);
    const out = [];
    for (const list of [pool, BY_MOD[it.mod]]) {
      for (const k of shuffle(list)) {
        if (out.length >= n) break;
        if (k === it.key) continue;
        const v = fold(plain(get(ITEMS[k]), true));
        if (!v || seen.has(v)) continue;
        seen.add(v);
        out.push(k);
      }
      if (out.length >= n) break;
    }
    return out;
  }
  const poolOf = (it) => BY_TOPIC[it.mod + "/" + it.topic];
  const options = (it, get, node) => shuffle([it.key, ...distractors(it, 3, get, poolOf(it))]).map((k) => ({ val: k, node: node(ITEMS[k]) }));
  const canSpeak = () => Speech.supported && Speech.en.length > 0;

  // Terms
  const enOf = (x) => x.en;
  function qMeaning(st, it) {
    return mcQ(st, { head: [cap(T.qMeaning), h("div", { class: "big", lang: "en" }, it.en, " ", say(it.en, false)), h("div", { class: "sub" }, L(POS[it.pos] || [it.pos]))],
      options: options(it, meanOf, (x) => h("span", { lang: T.htmlLang }, meanOf(x))), correct: it.key, it });
  }
  function qReverse(st, it) {
    return mcQ(st, { head: [cap(T.qReverse), h("div", { class: "big-mean" }, meanOf(it))], options: options(it, enOf, (x) => h("span", { lang: "en" }, x.en)), correct: it.key, it });
  }
  function qDef(st, it) {
    return mcQ(st, { head: [cap(T.qDef), h("div", { class: "def-q", lang: "en" }, rich(it.def, { mask: true }))], options: options(it, enOf, (x) => h("span", { lang: "en" }, x.en)), correct: it.key, it });
  }
  function qListen(st, it) {
    return mcQ(st, { head: cap(T.qListen), say: it.en, options: options(it, enOf, (x) => h("span", { lang: "en" }, x.en)), correct: it.key, it, cols: true });
  }
  function qCol(st, it) {
    const cols = (it.col || []).filter((c) => gapAnswers(c[0]).length);
    if (!cols.length) return qReverse(st, it);
    const c = cols[Math.floor(Math.random() * cols.length)];
    return typeQ(st, {
      head: [cap(T.qCol), h("div", { class: "cloze", lang: "en" }, rich(c[0], { gap: true })), EN() ? h("div", { class: "sub" }, "(" + it.en + ")") : h("div", { class: "sub", lang: "vi" }, T.hintVi, rich(c[1]))],
      answers: gapAnswers(c[0]), it,
      after: () => h("div", { class: "reveal" }, h("div", { class: "reveal-top", lang: "en" }, rich(c[0]), " ", say(c[0], false)), h("div", { class: "muted" }, it.en + " — " + meanOf(it))),
    });
  }
  function qType(st, it) {
    return typeQ(st, { head: [cap(T.qType), h("div", { class: "big-mean" }, meanOf(it)), h("div", { class: "sub" }, L(POS[it.pos] || [it.pos]))], answers: [it.en, ...(it.alt || [])], it });
  }
  // Symbols
  const texNode = (x) => tex(x.tex);
  function qSymRead(st, it) {
    return mcQ(st, { head: [cap(T.qSymRead), h("div", { class: "sym-big" }, tex(it.tex, true))], options: options(it, (x) => x.read, (x) => h("span", { lang: "en" }, x.read)), correct: it.key, it });
  }
  function qSymListen(st, it) {
    return mcQ(st, { head: cap(T.qSymListen), say: it.read, options: options(it, (x) => x.tex, texNode), correct: it.key, it, cols: true });
  }
  function qSymText(st, it) {
    return mcQ(st, { head: [cap(T.qSymText), h("div", { class: "big-mean", lang: "en" }, it.read, " ", say(it.read, false))], options: options(it, (x) => x.tex, texNode), correct: it.key, it, cols: true });
  }
  function qSymSay(st, it) {
    return selfQ(st, { head: [cap(T.qSymSay), h("div", { class: "sym-big" }, tex(it.tex, true))], it });
  }
  // Phrases
  function qPhrFn(st, it) {
    return mcQ(st, { head: [cap(T.qPhrFn), h("div", { class: "big-mean" }, L(it.fn))], options: options(it, (x) => x.en, (x) => h("span", { lang: "en" }, rich(x.en))), correct: it.key, it });
  }
  function qPhrRev(st, it) {
    if (EN()) return qPhrFn(st, it);
    return mcQ(st, { head: [cap(T.qPhrRev), h("div", { class: "big-mean", lang: "vi" }, rich(it.vi))], options: options(it, (x) => x.en, (x) => h("span", { lang: "en" }, rich(x.en))), correct: it.key, it });
  }
  function qPhrRight(st, it) {
    if (!it.wrong || !it.wrong.length) return qPhrCloze(st, it);
    const all = shuffle([["ok", it.ex[0]], ...it.wrong.map((w, i) => ["w" + i, w])]);
    return mcQ(st, { head: [cap(T.qPhrRight), h("div", { class: "sub" }, L(it.fn))], options: all.map(([v, s]) => ({ val: v, node: h("span", { lang: "en" }, rich(s)) })), correct: "ok", it, extra: noteBox(it) });
  }
  function qPhrCloze(st, it) {
    return typeQ(st, {
      head: [cap(T.qPhrCloze), h("div", { class: "cloze", lang: "en" }, rich(it.cloze, { gap: true })), EN() ? h("div", { class: "sub" }, L(it.fn)) : h("div", { class: "sub", lang: "vi" }, T.hintVi, rich(it.ex[1]))],
      answers: gapAnswers(it.cloze), it,
      after: () => h("div", {}, reveal(it), noteBox(it)),
    });
  }

  async function runQueue(st, tasks, offset, total, onFirst, my) {
    const queue = tasks.slice();
    let n = offset;
    while (queue.length) {
      const t = queue.shift();
      st.set(n, total);
      const ok = await t.run(st);
      alive(my);
      if (!t.tries) { t.tries = 0; if (onFirst) onFirst(t, ok); }
      t.tries++;
      if (ok || t.tries >= 2) n++; else queue.push(t);
    }
  }
  function lessonRounds(mod, keys) {
    const its = keys.map((k) => ITEMS[k]);
    const R = (fn, list = its) => shuffle(list).map((it) => ({ key: it.key, run: (s) => fn(s, it) }));
    if (mod === "terms") return [R(qMeaning), R(qDef), canSpeak() ? R(qListen) : R(qReverse), R(qCol), R(qType)];
    if (mod === "symbols") return [R(qSymRead), canSpeak() ? R(qSymListen) : R(qSymText), R(qSymSay)];
    return [R(qPhrFn), R(qPhrRight, its.filter((it) => it.wrong && it.wrong.length)), R(qPhrCloze)];
  }

  async function lessonPage(mod, tid, n) {
    const f = lessonOf(mod, tid, Number(n));
    if (!f || !f.l) return notFound();
    const { t, l } = f;
    if (!unlocked(t, l)) { toast(T.lockedToast); location.hash = "#/m/" + mod; return; }
    const my = tok;
    const keys = l.keys.slice();
    const title = modOf(mod).emoji + " " + tTitle(t) + " · " + T.lesson(l.n);
    const st = makeStage(title, () => { if (confirm(T.exitLesson)) location.hash = "#/m/" + mod; });
    mount(st.el);

    let loopOn = false;
    for (let i = 0; i < keys.length; i++) {
      st.set(i, keys.length);
      await new Promise((go) => {
        const it = ITEMS[keys[i]];
        let off = null, loopTimer = 0;
        const stopLoop = () => clearInterval(loopTimer);
        const startLoop = () => { stopLoop(); const me = tok; loopTimer = setInterval(() => { if (me !== tok || !loopBtn.isConnected) stopLoop(); else speak(sayOf(it)); }, it.mod === "phrases" ? 7000 : 3500); };
        const paint = () => { loopBtn.classList.toggle("on", loopOn); loopBtn.setAttribute("aria-pressed", String(loopOn)); loopBtn.textContent = loopOn ? T.loopOn : T.loopOff; };
        const loopBtn = btn("", () => { loopOn = !loopOn; paint(); if (loopOn) { speak(sayOf(it)); startLoop(); } else { stopLoop(); Speech.stop(); } }, "btn ghost loop");
        paint();
        const next = btn(i === keys.length - 1 ? T.toExercises : T.nextCard, () => { stopLoop(); off(); go(); }, "btn big");
        const prev = i ? btn(T.prev, () => { stopLoop(); off(); i -= 2; go(); }, "btn ghost") : null;
        off = keyHandler({ Enter: () => next.click(), ArrowRight: () => next.click(), ArrowLeft: () => prev && prev.click(), r: () => loopBtn.click() });
        st.show(cap(T.cardCap(i + 1, keys.length)), cardOf(it), h("div", { class: "actions center" }, loopBtn, flagBtn(it.key)), h("div", { class: "actions center" }, prev, next));
        if (loopOn) { sayLater(sayOf(it)); startLoop(); } else if (settings.autoplay) sayLater(sayOf(it));
      });
      alive(my);
    }

    const rounds = lessonRounds(mod, keys);
    const total = rounds.reduce((a, r) => a + r.length, 0);
    const stat = { n: 0, ok: 0 };
    const wrongKeys = new Set();
    let at = 0;
    for (const r of rounds) {
      if (!r.length) continue;
      await runQueue(st, r, at, total, (task, ok) => { stat.n++; if (ok) stat.ok++; else wrongKeys.add(task.key); }, my);
      at += r.length;
    }

    const fresh = learn(keys);
    wrongKeys.forEach(noteWrong);
    const acc = pct(stat.ok, stat.n);
    done[l.id] = { at: Date.now(), acc };
    saveDone();
    if (fresh) bump("n", fresh);
    const nextL = t.lessons[l.n];
    const ti = topicsOf(mod).indexOf(t);
    const nextT = !nextL && topicsOf(mod)[ti + 1];
    mount(h("section", { class: "summary" },
      h("div", { class: "big-emo" }, acc >= 85 ? "🎉" : acc >= 60 ? "👍" : "💪"),
      h("h1", {}, T.doneLesson(l.n, tTitle(t))),
      h("p", { class: "score " + (acc >= 85 ? "good" : acc >= 60 ? "mid" : "low") }, T.firstTry(acc, stat.ok, stat.n)),
      h("p", { class: "muted" }, fresh ? T.freshText(fresh) : T.alreadyQueued),
      wrongKeys.size ? h("div", {}, h("h3", {}, T.watch), h("div", { class: "list" }, Array.from(wrongKeys).map((k) => row(k)))) : null,
      h("div", { class: "actions center" },
        nextL ? h("a", { class: "btn big", href: lessonHref(mod, t, nextL) }, T.lesson(nextL.n) + " →")
          : nextT ? h("a", { class: "btn big", href: lessonHref(mod, nextT, nextT.lessons[0]) }, nextT.emoji + " " + tTitle(nextT) + " →") : null,
        h("a", { class: "btn ghost", href: "#/m/" + mod }, T.backMod), h("a", { class: "btn ghost", href: "#/" }, T.home))));
  }

  function reviewTask(k) {
    const it = ITEMS[k], lv = lvOf(k), coin = Math.random() < 0.5;
    let fn;
    if (it.mod === "terms") fn = lv <= 1 ? qMeaning : lv === 2 ? (coin ? qDef : canSpeak() ? qListen : qReverse) : lv === 3 ? (coin ? qReverse : qCol) : lv === 4 ? (coin ? qCol : qDef) : coin ? qType : qCol;
    else if (it.mod === "symbols") fn = lv <= 1 ? qSymRead : lv === 2 ? (canSpeak() ? qSymListen : qSymText) : lv === 3 ? (coin ? qSymRead : qSymText) : coin ? qSymSay : canSpeak() ? qSymListen : qSymText;
    else fn = lv <= 1 ? qPhrFn : lv === 2 ? (it.wrong ? qPhrRight : qPhrRev) : lv === 3 ? qPhrCloze : lv === 4 ? (coin && it.wrong ? qPhrRight : qPhrCloze) : coin ? qPhrCloze : qPhrRev;
    return { key: k, run: (s) => fn(s, it) };
  }
  async function reviewPage(mode) {
    const keys = mode === "hard" ? hardKeys() : mode === "star" ? starKeys() : dueKeys();
    if (!keys.length) {
      const future = Object.keys(prog).filter(known).map((k) => prog[k].due).sort((a, b) => a - b)[0];
      mount(h("section", { class: "hero slim center" }, h("div", { class: "big-emo" }, "✅"),
        h("h1", {}, mode === "hard" ? T.noHard : mode === "star" ? T.noStar : T.noDue),
        h("p", { class: "muted" }, mode ? T.hardExplain : future ? T.nextDue(untilText(future - Date.now())) : T.learnFirst),
        h("div", { class: "actions center" }, h("a", { class: "btn big", href: "#/" }, T.pickLesson))));
      return;
    }
    const my = tok;
    const batch = keys.slice(0, mode ? 20 : REVIEW_BATCH);
    const st = makeStage(T.review, () => { if (confirm(T.exitReview)) location.hash = "#/"; });
    mount(st.el);
    const stat = { n: 0, ok: 0 };
    await runQueue(st, shuffle(batch).map(reviewTask), 0, batch.length, (t, ok) => { stat.n++; if (ok) stat.ok++; grade(t.key, ok); bump("r"); }, my);
    const rest = mode ? 0 : dueKeys().length;
    const acc = pct(stat.ok, stat.n);
    mount(h("section", { class: "summary" },
      h("div", { class: "big-emo" }, "🔁"),
      h("h1", {}, T.reviewedN(batch.length)),
      h("p", { class: "score " + (acc >= 85 ? "good" : acc >= 60 ? "mid" : "low") }, T.firstTryShort(acc, stat.ok, stat.n)),
      h("div", { class: "list" }, batch.map((k) => row(k))),
      h("div", { class: "actions center" },
        rest ? h("a", { class: "btn big", href: "#/review" }, T.moreReview(rest)) : null,
        h("a", { class: "btn ghost", href: "#/" }, T.home), h("a", { class: "btn ghost", href: "#/book" }, T.seeBook))));
  }

  const bookState = { scope: "all", sel: "due" };
  function bookPage() {
    const scoped = ALL.filter((k) => bookState.scope === "all" || ITEMS[k].mod === bookState.scope);
    const inScope = new Set(scoped);
    const count = [0, 0, 0, 0, 0, 0];
    scoped.forEach((k) => count[lvOf(k)]++);
    const mx = Math.max(1, ...count.slice(1));
    const sets = {
      due: { label: T.setDue, keys: dueKeys().filter((k) => inScope.has(k)) },
      hard: { label: T.setHard, keys: hardKeys().filter((k) => inScope.has(k)) },
      star: { label: T.setStar, keys: starKeys().filter((k) => inScope.has(k)) },
      flag: { label: T.setFlag, keys: flagKeys().filter((k) => inScope.has(k)) },
      l0: { label: T.setNew, keys: scoped.filter((k) => lvOf(k) === 0) },
    };
    for (let i = 1; i <= 5; i++) sets["l" + i] = { label: T.lv[i], keys: scoped.filter((k) => lvOf(k) === i) };
    const cur = sets[bookState.sel] || sets.due;
    const chips = (list, key) => h("div", { class: "chips" }, list.map(([id, label]) => h("button", { type: "button", class: "chip" + (bookState[key] === id ? " on" : ""), onclick: () => { bookState[key] = id; bookPage(); } }, label)));
    const shown = cur.keys.slice(0, 150);
    mount(
      h("section", { class: "hero slim" }, h("h1", {}, T.bookTitle), h("p", { class: "muted" }, T.bookText),
        chips([["all", T.chipAll(ALL.length)], ...MODS.map((m) => [m.id, m.emoji + " " + modTitle(m.id)])], "scope")),
      h("div", { class: "bars", role: "group" }, [1, 2, 3, 4, 5].map((i) =>
        h("button", { type: "button", class: "barcol" + (bookState.sel === "l" + i ? " on" : ""), onclick: () => { bookState.sel = "l" + i; bookPage(); } },
          h("span", { class: "barnum" }, String(count[i])), h("span", { class: "barfill l" + i, style: "height:" + Math.max(4, Math.round((count[i] / mx) * 100)) + "%" }), h("span", { class: "barlab" }, T.lv[i])))),
      chips([["due", T.chipDue(sets.due.keys.length)], ["hard", T.chipHard(sets.hard.keys.length)], ["star", T.chipStar(sets.star.keys.length)], ["flag", T.chipFlag(sets.flag.keys.length)], ["l0", T.chipNew(count[0])]], "sel"),
      h("h3", {}, T.listHead(cur.label, cur.keys.length)),
      h("div", { class: "actions" },
        cur.keys.length && (bookState.sel === "hard" || bookState.sel === "star") ? h("a", { class: "btn small", href: "#/review/" + bookState.sel }, T.reviewThese) : null,
        bookState.sel === "flag" && cur.keys.length ? btn(T.copyFlags, copyFlags, "btn small ghost") : null),
      h("div", { class: "list" }, shown.length ? shown.map((k) => row(k, { topic: true, onFlag: bookPage })) : h("p", { class: "muted" }, T.emptySet)));
  }
  async function copyFlags() {
    const text = flagKeys().map((k) => { const it = ITEMS[k]; return "- [" + it.mod + "/" + it.topic + "/" + it.id + "] " + plain(it.en || it.read, true) + " — " + flags[k].note; }).join("\n");
    try { await navigator.clipboard.writeText(text); toast(T.copied); } catch (e) { prompt("", text); }
  }

  const searchState = { q: "" };
  let searchIndex = null;
  function searchPage() {
    if (!searchIndex) searchIndex = ALL.map((k) => [k, searchText(ITEMS[k])]);
    const out = h("div", { class: "list" });
    const info = h("p", { class: "small muted" });
    const input = h("input", { type: "search", class: "input", value: searchState.q, placeholder: T.searchPh, "aria-label": T.searchPh });
    const paint = () => {
      const q = fold(searchState.q.trim());
      const hits = searchIndex.filter(([, s]) => !q || s.includes(q));
      if (q) hits.sort((a, b) => (fold(ITEMS[a[0]].en || ITEMS[a[0]].read).startsWith(q) ? 0 : 1) - (fold(ITEMS[b[0]].en || ITEMS[b[0]].read).startsWith(q) ? 0 : 1));
      info.textContent = T.hits(hits.length);
      out.replaceChildren(...hits.slice(0, 80).map(([k]) => row(k, { topic: true })));
    };
    let timer = 0;
    input.addEventListener("input", () => { searchState.q = input.value; clearTimeout(timer); timer = setTimeout(paint, 120); });
    mount(h("section", { class: "hero slim" }, h("h1", {}, T.searchTitle), input), info, out);
    paint();
    setTimeout(() => input.focus(), 50);
  }

  function settingsPage() {
    const langSel = h("div", { class: "chips", role: "group", "aria-label": T.language }, [["vi", "🇻🇳 " + T.langVi], ["en", "🇬🇧 " + T.langEn]].map(([id, label]) =>
      h("button", { type: "button", class: "chip" + (settings.lang === id ? " on" : ""), "aria-pressed": String(settings.lang === id), onclick: () => setLang(id) }, label)));
    const voices = Speech.en;
    const voiceSel = h("select", { class: "input", "aria-label": T.voice }, voices.length ? voices.map((v) => h("option", { value: v.voiceURI, selected: Speech.chosen && Speech.chosen.voiceURI === v.voiceURI }, v.name + " (" + v.lang + ")")) : [h("option", {}, T.noVoice)]);
    voiceSel.addEventListener("change", () => { store.set("voice", voiceSel.value); Speech.load(); speak("The gradient vanishes at x bar."); });
    const rate = h("input", { type: "range", min: "0.6", max: "1.2", step: "0.05", value: String(Speech.rate), "aria-label": T.rate });
    rate.addEventListener("change", () => { Speech.rate = Number(rate.value); store.set("rate", Speech.rate); speak("x sub n converges weakly to x."); });
    const goal = h("select", { class: "input", "aria-label": T.goal }, [5, 10, 15, 20, 30].map((n) => h("option", { value: n, selected: n === settings.goal }, T.goalOpt(n))));
    goal.addEventListener("change", () => { settings.goal = Number(goal.value); saveSet(); toast(T.goalSaved); });
    const unlock = h("input", { type: "checkbox", checked: settings.unlockAll });
    unlock.addEventListener("change", () => { settings.unlockAll = unlock.checked; saveSet(); });
    const auto = h("input", { type: "checkbox", checked: settings.autoplay });
    auto.addEventListener("change", () => { settings.autoplay = auto.checked; saveSet(); });
    const file = h("input", { type: "file", accept: "application/json", hidden: true });
    file.addEventListener("change", async () => {
      try {
        const obj = JSON.parse(await file.files[0].text());
        if (!confirm(T.restoreAsk)) return;
        store.load(obj);
        toast(T.restored);
        setTimeout(() => location.reload(), 700);
      } catch (e) { toast(T.badFile); }
    });
    mount(h("section", { class: "hero slim" }, h("h1", {}, T.settingsTitle)),
      h("div", { class: "set" },
        h("div", { class: "set-row" }, h("span", {}, T.language), langSel),
        h("label", {}, h("span", {}, T.goal), goal),
        h("label", { class: "inline" }, unlock, h("span", {}, T.unlockAll)),
        h("label", { class: "inline" }, auto, h("span", {}, T.autoplay)),
        h("label", {}, h("span", {}, T.voice), voiceSel),
        h("label", {}, h("span", {}, T.rate), rate),
        h("p", { class: "small muted" }, T.voiceNote),
        MF.Sync ? MF.Sync.panel({ cls: "sync", heading: "h3" }) : null,
        h("div", { class: "actions" },
          btn(T.backup, () => {
            const obj = {};
            Object.entries(store.dump()).forEach(([k, v]) => { if (k !== "mf.sync-cfg") obj[k] = v; });
            const a = h("a", { href: URL.createObjectURL(new Blob([JSON.stringify(obj)], { type: "application/json" })), download: "mathfluent-" + today() + ".json" });
            document.body.append(a); a.click(); a.remove();
          }, "btn ghost"),
          btn(T.restore, () => file.click(), "btn ghost"), file,
          btn(T.reset, () => {
            if (!confirm(T.resetAsk)) return;
            ["prog", "done", "log"].forEach((k) => store.del(k));
            prog = {}; done = {}; log = {};
            toast(T.resetDone); refreshBadge(); settingsPage();
          }, "btn ghost danger"))));
  }

  function notFound() {
    mount(h("section", { class: "hero slim center" }, h("h1", {}, T.notFound), h("div", { class: "actions center" }, h("a", { class: "btn", href: "#/" }, T.home))));
  }

  // ---- data + routing ---------------------------------------------------------------
  async function loadData() {
    const mods = {};
    await Promise.all(MODS.map(async (m) => {
      const r = await fetch(m.file + "?v=1", { cache: "no-cache" });
      if (!r.ok) throw new Error(m.file + " " + r.status);
      mods[m.id] = await r.json();
    }));
    for (const m of MODS) {
      BY_MOD[m.id] = [];
      for (const t of mods[m.id].topics) {
        const keys = t.items.map((it) => {
          const key = PREFIX[m.id] + ":" + it.id;
          Object.assign(it, { key, mod: m.id, topic: t.id });
          ITEMS[key] = it;
          return key;
        });
        BY_TOPIC[m.id + "/" + t.id] = keys;
        BY_MOD[m.id].push(...keys);
        t.lessons = chunk(keys).map((ks, i) => ({ id: m.id + "." + t.id + "." + (i + 1), n: i + 1, keys: ks }));
      }
    }
    ALL = Object.keys(ITEMS);
    D = { mods };
  }

  async function route() {
    const my = ++tok;
    Speech.stop();
    const parts = location.hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
    const a = parts[0];
    const navId = { review: "review", book: "book", search: "search", settings: "settings" }[a] || "home";
    document.querySelectorAll(".nav a").forEach((x) => x.classList.toggle("on", x.dataset.nav === navId));
    try {
      if (!D) {
        mount(h("p", { class: "loading" }, T.loading));
        await loadData();
        refreshBadge();
        setInterval(refreshBadge, 30000);
      }
      if (my !== tok) return;
      if (a === "m") modPage(parts[1]);
      else if (a === "l") await lessonPage(parts[1], parts[2], parts[3]);
      else if (a === "i") itemPage(parts[1]);
      else if (a === "review") await reviewPage(parts[1]);
      else if (a === "book") bookPage();
      else if (a === "search") searchPage();
      else if (a === "settings") settingsPage();
      else home();
    } catch (e) {
      if (e === CANCEL) return;
      console.error(e);
      mount(h("p", { class: "loading" }, T.loadFail));
    }
  }

  $("#t-theme").addEventListener("click", () => {
    const t = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = t;
    store.set("theme", t);
  });
  $("#t-lang").addEventListener("click", () => setLang(EN() ? "vi" : "en"));
  document.addEventListener("mf-sync", () => {
    prog = store.get("prog", {});
    done = store.get("done", {});
    log = store.get("log", {});
    flags = store.get("flags", {});
    refreshBadge();
    if (D && !document.querySelector(".stage .q")) route();
  });
  MF.speakTex = speakTex;
  applyChrome();
  window.addEventListener("hashchange", route);
  route();
})();
