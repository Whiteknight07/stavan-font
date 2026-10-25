import { Hand, load } from "../stavan.js";
import { handData, buildFont, XH } from "./fontmaker.js";
import { notebookPDF } from "../notebook.js";

const LIBS = {
  opentype: "https://cdn.jsdelivr.net/npm/opentype.js@1.3.4/+esm",
  clip: "https://cdn.jsdelivr.net/npm/polygon-clipping@0.15.7/+esm",
};
let libsP = null;
const getLibs = () => (libsP ||= Promise.all([import(LIBS.opentype), import(LIBS.clip)]).then(([o, c]) => ({
  opentype: o.default || o, union: (c.default || c).union,
})));

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const status = $("#status");
const say = (m) => { status.textContent = m; clearTimeout(say.t); say.t = setTimeout(() => (status.textContent = ""), 4000); };

// ---------- what to draw ----------
const LOWER = [..."abcdefghijklmnopqrstuvwxyz"];
const UPPER = [..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"];
const DIGITS = [..."0123456789"];
const QUICK = [...LOWER, ".", ",", "!", "?", "'"];
const FULL = [...LOWER, ...UPPER, ...DIGITS, ".", ",", "!", "?", "'", '"', "-", "(", ")", ":", ";", "&", "@", "#", "/", "+", "=", "*"];
// typed characters that reuse a drawing
const ALIAS = { "’": "'", "‘": "'", "“": '"', "”": '"', "–": "-" };
const TALL = new Set([..."bdfhklt", ...UPPER, ...DIGITS, "!", "?", "'", '"', "(", ")", "&", "@", "#", "/", "{", "}"]);
const DESC = new Set([..."gjpqy", ",", ";"]);

const KEY = "stavan-make-v1";
const saved = (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })();
const state = {
  set: saved.set === "full" ? "full" : "quick",
  extra: !!saved.extra,
  drawings: saved.drawings || {},      // { ch: [version0 strokes, version1, version2] }
  name: saved.name || "My Handwriting",
  pen: saved.pen === 0.15 ? 0.15 : 0.085,
  step: saved.step || 0,
  auto: !!saved.auto,
};
const persist = () => {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { say("This browser won't save drawings. Use Back up drawings before you leave."); }
};

let steps = [];
function makeSteps() {
  const base = state.set === "full" ? FULL : QUICK;
  steps = base.map((ch) => ({ ch, v: 0 }));
  if (state.extra) {
    const more = state.set === "full" ? [...LOWER, ...DIGITS] : LOWER;
    for (const v of [1, 2]) steps.push(...more.map((ch) => ({ ch, v })));
  }
  state.step = Math.min(state.step, steps.length - 1);
}
const versionOf = (s) => (state.drawings[s.ch] || [])[s.v] || [];
const isDone = (s) => versionOf(s).length > 0;

// ---------- the drawing pad ----------
const canvas = $("#pad");
const ctx = canvas.getContext("2d");
let W = 0, H = 0, xhPx = 70, base = 200, dpr = 1;
let current = null;          // stroke being drawn (font units, flat)
let penSeen = false, autoTimer = null;

function geometry() {
  const r = canvas.getBoundingClientRect();
  dpr = window.devicePixelRatio || 1;
  W = r.width; H = r.height;
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
  xhPx = H * 0.2;
  base = H * 0.66;
  redraw();
}
const toFont = (px, py) => [Math.round((px / xhPx) * XH * 10) / 10, Math.round(((base - py) / xhPx) * XH * 10) / 10];
const toPx = (x, y) => [(x / XH) * xhPx, base - (y / XH) * xhPx];

function redraw() {
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const css = getComputedStyle(document.documentElement);
  const line = (y, color, dash = [], w = 1.25) => {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = w; ctx.setLineDash(dash);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); ctx.restore();
  };
  line(base - 1.75 * xhPx, "#e3e8f0");                    // capitals and tall letters
  line(base - xhPx, "#c5d3e8", [7, 6]);                    // x-height
  line(base, css.getPropertyValue("--rule").trim() || "#c5d3e8", [], 1.6); // baseline
  line(base + 0.85 * xhPx, "#e3e8f0");                    // descenders
  ctx.strokeStyle = "#000";
  ctx.lineWidth = state.pen * xhPx;
  ctx.lineCap = ctx.lineJoin = "round";
  const strokes = [...versionOf(steps[state.step]), ...(current ? [current] : [])];
  for (const s of strokes) {
    ctx.beginPath();
    for (let i = 0; i < s.length; i += 2) {
      const [x, y] = toPx(s[i], s[i + 1]);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    }
    if (s.length === 2) { const [x, y] = toPx(s[0], s[1]); ctx.lineTo(x + 0.01, y); }
    ctx.stroke();
  }
}

function pointer(e) {
  const r = canvas.getBoundingClientRect();
  return toFont(e.clientX - r.left, e.clientY - r.top);
}
canvas.addEventListener("pointerdown", (e) => {
  if (e.pointerType === "pen") penSeen = true;
  if (penSeen && e.pointerType === "touch") return;     // ignore the palm when drawing with a stylus
  clearTimeout(autoTimer);
  canvas.setPointerCapture(e.pointerId);
  current = pointer(e);
  redraw();
  e.preventDefault();
});
canvas.addEventListener("pointermove", (e) => {
  if (!current || !canvas.hasPointerCapture(e.pointerId)) return;
  const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
  for (const ev of evs.length ? evs : [e]) current.push(...pointer(ev));
  redraw();
});
const finish = (e) => {
  if (!current) return;
  const s = steps[state.step];
  const list = (state.drawings[s.ch] ||= []);
  while (list.length <= s.v) list.push([]);
  list[s.v] = [...list[s.v], current];
  current = null;
  changed();
  if (state.auto) autoTimer = setTimeout(() => next(), 900);
  if (e && canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
};
canvas.addEventListener("pointerup", finish);
canvas.addEventListener("pointercancel", () => { current = null; redraw(); });

function undo() {
  const s = steps[state.step];
  const v = versionOf(s);
  if (!v.length) return back();
  state.drawings[s.ch][s.v] = v.slice(0, -1);
  changed();
}
function clearChar() {
  const s = steps[state.step];
  if (state.drawings[s.ch]) state.drawings[s.ch][s.v] = [];
  changed();
}
function go(i) {
  clearTimeout(autoTimer);
  state.step = Math.max(0, Math.min(steps.length - 1, i));
  persist();
  showStep();
}
function next() {
  if (state.step >= steps.length - 1) {
    $("#try").focus({ preventScroll: true });
    $("#try-title").scrollIntoView({ behavior: "smooth", block: "start" });
    say(`Done. ${countDone()} characters drawn. Name your font and download it.`);
    return;
  }
  go(state.step + 1);
}
const back = () => go(state.step - 1);
const countDone = () => steps.filter(isDone).length;

// ---------- character strip ----------
function renderStrip() {
  const strip = $("#strip");
  strip.innerHTML = steps.map((s, i) =>
    `<button role="option" data-i="${i}" aria-selected="${i === state.step}" class="${isDone(s) ? "done" : ""}"` +
    ` aria-label="${s.ch === '"' ? "double quote" : s.ch}${s.v ? `, version ${s.v + 1}` : ""}${isDone(s) ? ", drawn" : ""}">` +
    `${s.ch.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;")}${s.v ? `<sup>${s.v + 1}</sup>` : ""}</button>`).join("");
  strip.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest", inline: "center" });
}
$("#strip").addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) go(+b.dataset.i); });

function showStep() {
  const s = steps[state.step];
  $("#target-char").textContent = s.ch;
  $("#target-meta").textContent = `${s.v ? `version ${s.v + 1}, ` : ""}${state.step + 1} of ${steps.length}`;
  $("#pad-hint").textContent = DESC.has(s.ch) ? "This one dips below the baseline, down toward the bottom line."
    : TALL.has(s.ch) ? "This one reaches up toward the top line."
    : "Sit it on the baseline, about as tall as the dashed line.";
  $("#next").textContent = state.step === steps.length - 1 ? "Finish" : "Next";
  renderStrip();
  redraw();
  progress();
}
function progress() {
  const n = countDone();
  $("#progress").textContent = n ? `${n} of ${steps.length} drawn.` : "";
}

// ---------- controls ----------
$("#undo").addEventListener("click", undo);
$("#clear").addEventListener("click", clearChar);
$("#next").addEventListener("click", next);
$("#back").addEventListener("click", back);
$("#auto").checked = state.auto;
$("#auto").addEventListener("change", (e) => { state.auto = e.target.checked; persist(); });
addEventListener("keydown", (e) => {
  if (e.target.closest("input, textarea")) return;
  if (e.key === "Enter") { next(); e.preventDefault(); }
  else if (e.key === "Backspace" || ((e.metaKey || e.ctrlKey) && e.key === "z")) { undo(); e.preventDefault(); }
  else if (e.key === "ArrowRight") next();
  else if (e.key === "ArrowLeft") back();
});
function setSet(set) {
  state.set = set;
  $$("[data-set]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.set === set)));
  const at = steps[state.step];
  makeSteps();
  const i = at ? steps.findIndex((s) => s.ch === at.ch && s.v === at.v) : 0;
  state.step = i >= 0 ? i : 0;
  persist(); showStep(); changed(false);
}
$$("[data-set]").forEach((b) => b.addEventListener("click", () => setSet(b.dataset.set)));
$("#extra").checked = state.extra;
$("#extra").addEventListener("change", (e) => { state.extra = e.target.checked; setSet(state.set); });

// ---------- try it: a real font built from the drawings ----------
const tryArea = $("#try"), tryInk = $("#try-ink");
tryArea.value = "the quick brown fox jumps over the lazy dog";
let hand = null, fontSeq = 0, buildTimer = null;
const cache = new Map();

function forBuild() {
  const out = {};
  for (const [ch, vs] of Object.entries(state.drawings)) {
    const real = (vs || []).filter((v) => v && v.length);
    if (real.length) out[ch] = real;
  }
  for (const [alias, src] of Object.entries(ALIAS)) if (out[src] && !out[alias]) out[alias] = out[src];
  return out;
}
function changed(redrawPad = true) {
  persist();
  if (redrawPad) redraw();
  renderStrip();
  progress();
  clearTimeout(buildTimer);
  buildTimer = setTimeout(rebuild, 450);
}
async function rebuild() {
  const d = forBuild();
  const n = Object.keys(d).length;
  $("#try-note").textContent = n
    ? `${n} characters so far. Letters you haven't drawn yet show in the default font.`
    : "Draw a few letters and they show up here. Type to see your handwriting.";
  if (!n) { tryArea.style.fontFamily = ""; hand = null; return; }
  const { meta, strokes } = handData(d, { pen: state.pen });
  hand = new Hand(meta, strokes, "Mine");
  const seq = ++fontSeq;
  try {
    const libs = await getLibs();
    const buf = buildFont(libs, d, { family: state.name, pen: state.pen, cache });
    if (seq !== fontSeq) return;
    const face = new FontFace(`MakerPreview${seq}`, buf);
    await face.load();
    document.fonts.add(face);
    tryArea.style.fontFamily = `"MakerPreview${seq}", system-ui, sans-serif`;
  } catch (err) {
    say(`Couldn't build the preview font: ${err.message}`);
  }
}

$("#font-name").value = state.name;
$("#font-name").addEventListener("input", (e) => { state.name = e.target.value.trim() || "My Handwriting"; persist(); });
$$("[data-pen]").forEach((b) => {
  b.setAttribute("aria-checked", String(+b.dataset.pen === state.pen));
  b.addEventListener("click", () => {
    state.pen = +b.dataset.pen;
    $$("[data-pen]").forEach((x) => x.setAttribute("aria-checked", String(x === b)));
    changed();
  });
});

const slug = () => state.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "my-handwriting";
function download(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
$("#download").addEventListener("click", async () => {
  const d = forBuild();
  if (!Object.keys(d).length) return say("Draw at least one letter first.");
  const libs = await getLibs();
  const buf = buildFont(libs, d, { family: state.name, pen: state.pen, cache });
  download(new Blob([buf], { type: "font/otf" }), `${slug()}.otf`);
  say("Font saved. Double-click the file to install it.");
});

let replayTimer = null;
$("#replay").addEventListener("click", () => {
  if (!hand) return say("Draw a few letters first.");
  if (replayTimer) return stopReplay();
  const cs = getComputedStyle(tryArea);
  const size = parseFloat(cs.fontSize);
  const width = tryArea.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  tryInk.innerHTML = hand.svg(tryArea.value, { size, maxWidth: width, pad: 0, animate: true, color: "currentColor" });
  tryInk.hidden = false;
  tryArea.style.visibility = "hidden";
  $("#replay").textContent = "Stop";
  const strokes = hand.penStrokes(tryArea.value, width / (size / 1000)).strokes;
  replayTimer = setTimeout(stopReplay, (hand.timing(strokes).total + 1) * 1000);
});
function stopReplay() {
  clearTimeout(replayTimer); replayTimer = null;
  tryInk.innerHTML = ""; tryArea.style.visibility = "";
  $("#replay").textContent = "Watch it write";
}
$("#save-svg").addEventListener("click", () => {
  if (!hand) return say("Draw a few letters first.");
  const svg = hand.svg(tryArea.value, { size: 64, animate: true, color: "#000", background: "#fff", maxWidth: 900 });
  download(new Blob([svg], { type: "image/svg+xml" }), `${slug()}.svg`);
});

$("#save-pdf").addEventListener("click", async () => {
  if (!hand) return say("Draw a few letters first.");
  const blob = await notebookPDF(hand, tryArea.value, { ink: "#000000", paper: "ruled", title: state.name });
  download(blob, `${slug()}-notes.pdf`);
  say("Notebook pages saved, in your handwriting.");
});

// ---------- backup ----------
$("#export").addEventListener("click", () => {
  const data = { format: "stavan-make", version: 1, name: state.name, pen: state.pen, set: state.set, extra: state.extra, drawings: state.drawings };
  download(new Blob([JSON.stringify(data)], { type: "application/json" }), `${slug()}-drawings.json`);
});
$("#import").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (data.format !== "stavan-make" || typeof data.drawings !== "object") throw new Error("not a drawings backup");
    Object.assign(state, { drawings: data.drawings, name: data.name || state.name, pen: data.pen === 0.15 ? 0.15 : 0.085, extra: !!data.extra });
    $("#font-name").value = state.name; $("#extra").checked = state.extra;
    setSet(data.set === "full" ? "full" : "quick");
    say("Backup restored.");
  } catch (err) { say(`That file couldn't be restored: ${err.message}.`); }
  e.target.value = "";
});
$("#reset").addEventListener("click", () => {
  if (!confirm("Delete all your drawings and start over?")) return;
  state.drawings = {}; state.step = 0;
  changed(); showStep();
});

// ---------- start ----------
makeSteps();
$$("[data-set]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.set === state.set)));
new ResizeObserver(geometry).observe(canvas);
showStep();
rebuild();
load("data/", "Regular").then((h) => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#make-title").innerHTML = h.svg("make your own", { size: 54, pad: 0, animate: !reduce, speed: 7, color: "currentColor" });
});
// expose for automated tests
window.__make = { state, steps: () => steps, forBuild, rebuild, getLibs };
