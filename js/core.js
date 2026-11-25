(() => {
  "use strict";
  const MF = (window.MF = window.MF || {});

  const $ = (sel, root = document) => root.querySelector(sel);
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      el.appendChild(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  }
  const btn = (label, onclick, cls = "btn", title) =>
    h("button", { type: "button", class: cls, onclick, title: title || null, "aria-label": title || null }, label);
  const shuffle = (a) => {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };

  // Loose comparison for typed answers: case, accents, punctuation, hyphens and extra spaces don't matter.
  function fold(s) {
    return String(s).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/Đ/g, "d")
      .toLowerCase().replace(/[’‘`´]/g, "'").replace(/[-‐–—]/g, " ")
      .replace(/[.,!?;:"“”()…]/g, " ").replace(/\s+/g, " ").trim();
  }
  function lev(a, b) {
    if (Math.abs(a.length - b.length) > 1) return 2;
    const row = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      let diag = row[0];
      row[0] = i;
      for (let j = 1; j <= b.length; j++) {
        const t = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
        diag = t;
      }
    }
    return row[b.length];
  }
  // { ok, typo, answer } — typo: a one-letter slip on an answer of 6+ letters still counts, with a note.
  function check(input, answers) {
    const v = fold(input);
    if (!v) return { ok: false };
    for (const a of answers) if (fold(a) === v) return { ok: true, answer: a };
    for (const a of answers) {
      const f = fold(a);
      if (f.replace(/ /g, "").length >= 6 && lev(v, f) === 1) return { ok: true, typo: true, answer: a };
    }
    return { ok: false };
  }

  let toastTimer = 0;
  function toast(text, ms = 2600) {
    let t = $(".toast");
    if (!t) t = document.body.appendChild(h("div", { class: "toast", role: "status" }));
    t.textContent = text;
    t.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("on"), ms);
  }

  const PREFIX = "mf.";
  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem(PREFIX + k);
        return v == null ? d : JSON.parse(v);
      } catch (e) { return d; }
    },
    set(k, v) { try { localStorage.setItem(PREFIX + k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(PREFIX + k); } catch (e) {} },
    dump() {
      const out = {};
      try {
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.startsWith(PREFIX)) out[k] = localStorage.getItem(k);
        }
      } catch (e) {}
      return out;
    },
    load(obj) {
      for (const [k, v] of Object.entries(obj || {})) {
        if (k.startsWith(PREFIX) && typeof v === "string") try { localStorage.setItem(k, v); } catch (e) {}
      }
    },
    clear() { Object.keys(this.dump()).forEach((k) => { try { localStorage.removeItem(k); } catch (e) {} }); },
  };

  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()); };

  // ---- Math rendering ------------------------------------------------------------------
  // Content strings may hold $inline$ / $$display$$ LaTeX, {{term}} marks (bold, or a blank in quizzes)
  // and [[collocate|alternative]] marks (highlighted, or a blank in fill-in exercises).
  function tex(src, display = false) {
    const span = h("span", { class: display ? "mx mx-d" : "mx" });
    const K = window.katex;
    if (K) {
      try { span.innerHTML = K.renderToString(src, { displayMode: display, throwOnError: false, strict: "ignore" }); }
      catch (e) { span.textContent = src; }
    } else span.textContent = src;
    return span;
  }
  const SPLIT = /(\$\$[^$]+\$\$|\$[^$]+\$|\{\{[^}]+\}\}|\[\[[^\]]+\]\])/;
  function rich(text, opts = {}) {
    const out = h("span", { class: opts.cls || null });
    for (const p of String(text == null ? "" : text).split(SPLIT)) {
      if (!p) continue;
      if (p.startsWith("$$")) out.append(tex(p.slice(2, -2), true));
      else if (p.startsWith("$")) out.append(tex(p.slice(1, -1)));
      else if (p.startsWith("{{")) out.append(opts.mask ? h("span", { class: "blank" }, "_____") : h("b", { class: "term-mark" }, p.slice(2, -2)));
      else if (p.startsWith("[[")) out.append(opts.gap ? h("span", { class: "blank" }, "_____") : h("b", { class: "col-mark" }, p.slice(2, -2).split("|")[0]));
      else out.append(p);
    }
    return out;
  }
  const gapAnswers = (text) => { const m = /\[\[([^\]]+)\]\]/.exec(String(text)); return m ? m[1].split("|").map((s) => s.trim()) : []; };
  // Text for speech or search: markers removed, first alternative kept, LaTeX dropped.
  const plain = (text, keepTex = false) => {
    let s = String(text || "").replace(/\{\{([^}]+)\}\}/g, "$1").replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, "$1");
    s = keepTex ? s.replace(/\$+/g, "") : s.replace(/\$\$[^$]+\$\$|\$[^$]+\$/g, " … ");
    return s.replace(/\s+/g, " ").trim();
  };

  // ---- Speech (English, built into the browser) -----------------------------------------
  const ROBOTIC = /eloquence|grandma|grandpa|rocko|shelley|sandy|reed|eddy|flo\b|bad news|bells|bubbles|jester|organ|trinoids|whisper|zarvox|cellos|albert|boing|wobble|superstar|ralph|fred|junior|kathy|bahh|good news/i;
  let warned = false;
  const Speech = {
    supported: "speechSynthesis" in window,
    voices: [],
    en: [],
    chosen: null,
    rate: store.get("rate", 0.92),
    load() {
      if (!this.supported) return;
      this.voices = speechSynthesis.getVoices() || [];
      this.en = this.voices.filter((v) => /^en([-_]|$)/i.test(v.lang || "") && !ROBOTIC.test(v.name));
      const saved = store.get("voice", "");
      this.chosen = this.en.find((v) => v.voiceURI === saved) || this.best(this.en) || null;
    },
    score(v) {
      let s = 0;
      if (/en[-_](GB|US)/i.test(v.lang)) s += 4;
      if (/natural|neural|online/i.test(v.name)) s += 8;
      if (/google|premium|enhanced|siri/i.test(v.name)) s += 5;
      if (/daniel|serena|samantha|karen|moira|kate|oliver/i.test(v.name)) s += 2;
      return s;
    },
    best(list) { return list.slice().sort((a, b) => this.score(b) - this.score(a))[0]; },
    say(text, opts = {}) {
      return new Promise((resolve) => {
        if (!this.supported) {
          if (!warned) { warned = true; toast("Trình duyệt này không có giọng đọc · This browser has no speech."); }
          return resolve(false);
        }
        if (!this.voices.length) this.load();
        const said = plain(text);
        if (!said) return resolve(true);
        const u = new SpeechSynthesisUtterance(said);
        const v = this.chosen;
        u.lang = (v && v.lang) || "en-GB";
        if (v) u.voice = v;
        u.rate = opts.slow ? 0.68 : this.rate;
        let done = false;
        const finish = (ok) => { if (!done) { done = true; resolve(ok); } };
        u.onend = () => finish(true);
        u.onerror = () => finish(false);
        speechSynthesis.cancel();
        speechSynthesis.speak(u);
        setTimeout(() => finish(true), 4000 + (said.length * 110) / u.rate);
      });
    },
    stop() { if (this.supported) speechSynthesis.cancel(); },
  };
  if (Speech.supported) {
    Speech.load();
    speechSynthesis.addEventListener("voiceschanged", () => Speech.load());
  }

  Object.assign(MF, { $, h, btn, shuffle, fold, check, toast, store, today, tex, rich, gapAnswers, plain, Speech });
})();
