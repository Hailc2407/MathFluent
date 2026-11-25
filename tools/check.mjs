// Checks the content files: structure, unique ids, gap markers and that every formula renders in KaTeX.
// Run from the repo root:  node tools/check.mjs
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const katex = require("../vendor/katex/katex.min.js");

const FILES = [["terms", "data/terms-optimization.json"], ["terms", "data/terms-analysis.json"], ["terms", "data/terms-functional.json"], ["terms", "data/terms-numerical.json"], ["symbols", "data/symbols.json"], ["phrases", "data/phrases.json"]];
const NEED = {
  terms: ["id", "en", "pos", "vi", "gloss", "def", "ex"],
  symbols: ["id", "tex", "read", "vi"],
  phrases: ["id", "fn", "en", "vi", "ex", "cloze"],
};
let errors = 0, warnings = 0, count = 0;
const err = (where, msg) => { errors++; console.log("✗ " + where + ": " + msg); };
const warn = (where, msg) => { warnings++; console.log("! " + where + ": " + msg); };

function strings(v, out = []) {
  if (typeof v === "string") out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => strings(x, out));
  else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out));
  return out;
}
function checkTex(where, src, display = false) {
  try { katex.renderToString(src, { displayMode: display, throwOnError: true, strict: "ignore" }); }
  catch (e) { err(where, "LaTeX does not render: " + src + "  (" + e.message.split("\n")[0] + ")"); }
}
function checkText(where, s) {
  if (/[\u0000-\u001f]/.test(s)) err(where, "control character (single backslash before n/t/f/b/r?): " + JSON.stringify(s));
  const dollars = (s.match(/\$/g) || []).length;
  if (dollars % 2) err(where, "odd number of $: " + s);
  for (const m of s.matchAll(/\$\$([^$]+)\$\$|\$([^$]+)\$/g)) checkTex(where, m[1] || m[2], Boolean(m[1]));
}
const gaps = (s) => (String(s).match(/\[\[[^\]]+\]\]/g) || []).length;
const plain = (s) => String(s).replace(/\[\[([^\]|]+)(\|[^\]]*)?\]\]/g, "$1");

for (const [mod, file] of FILES) {
  const data = JSON.parse(readFileSync(file, "utf8"));
  if (data.module !== mod) err(file, "module should be " + mod);
  const ids = new Set();
  for (const t of data.topics) {
    for (const k of ["id", "emoji", "title", "titleEn", "desc", "descEn"]) if (!t[k]) err(file + "#" + t.id, "topic missing " + k);
    if (!t.items || t.items.length < 4) err(file + "#" + t.id, "a topic needs at least 4 items (for answer options)");
    for (const it of t.items) {
      count++;
      const where = file.replace(/^data\/|\.json$/g, "") + "/" + t.id + "/" + it.id;
      if (ids.has(it.id)) err(where, "duplicate id");
      ids.add(it.id);
      for (const k of NEED[mod]) if (it[k] == null || it[k] === "") err(where, "missing " + k);
      strings(it).forEach((s) => checkText(where, s));
      if (it.note && (!Array.isArray(it.note) || it.note.length !== 2)) err(where, "note must be [vi, en]");
      if (it.ex && (!Array.isArray(it.ex) || it.ex.length !== 2)) err(where, "ex must be [en, vi]");
      if (mod === "terms") {
        if (!/\{\{[^}]+\}\}/.test(it.def)) err(where, "def needs a {{marked}} term");
        (it.col || []).forEach((c, i) => { if (gaps(c[0]) !== 1) err(where, "collocation " + (i + 1) + " needs exactly one [[gap]]"); if (!c[1]) err(where, "collocation " + (i + 1) + " needs a Vietnamese gloss"); });
        if (!(it.col || []).length) warn(where, "no collocations");
        if (it.ipa && !/^\/.+\/$/.test(it.ipa)) err(where, "ipa should look like /…/");
      }
      if (mod === "symbols") checkTex(where, it.tex, true);
      if (mod === "phrases") {
        if (gaps(it.cloze) !== 1) err(where, "cloze needs exactly one [[gap]]");
        if (!Array.isArray(it.fn) || it.fn.length !== 2) err(where, "fn must be [vi, en]");
        (it.wrong || []).forEach((w, i) => { if (w === it.ex[0]) err(where, "wrong " + (i + 1) + " equals the example"); });
        if (it.wrong && !plain(it.cloze).length) err(where, "empty cloze");
      }
    }
  }
}
console.log("\n" + count + " items checked · " + errors + " errors · " + warnings + " warnings");
process.exit(errors ? 1 : 0);
