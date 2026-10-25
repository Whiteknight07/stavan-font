import { load, Hand } from "./stavan.js";
import { notebookPDF } from "./notebook.js";
import { stlFromText } from "./print3d.js";

const SITE = "https://font.stavan.ai";
const DEFAULT_TEXT = `Hi, this is my handwriting, typed.
Every letter here was cut out of real Apple Pencil strokes from my lecture notes. Each one has five versions that take turns as you type, so no two words come out the same.
This page is yours now. Type over it.`;
const INKS = ["#000000", "#d10000", "#007aff", "#f49923", "#636363", "#82218c"];
// on the neon wall each ink becomes a gas: pink, red, cyan, amber, white, violet
const NEON = { "#000000": "#ff4fd8", "#d10000": "#ff3b30", "#007aff": "#35d6ff", "#f49923": "#ffb23b", "#636363": "#f4f1ff", "#82218c": "#b46bff" };

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const root = document.documentElement;
const pad = $("#pad"), layer = $("#replay-layer"), inkLayer = $("#ink-layer"), status = $("#status");
const reduceMotion = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

const hands = {};
const getHand = (w) => (hands[w] ||= load("data/", w));
let words = null;
const getWords = () => (words ||= fetch("data/words.json").then((r) => r.json()));

// ---------- state, kept in the URL so any page can be shared ----------
const q = new URLSearchParams(location.hash.slice(1));
const state = {
  text: q.get("t") ?? DEFAULT_TEXT,
  ink: INKS.includes("#" + q.get("ink")) ? "#" + q.get("ink") : INKS[0],
  size: Math.min(72, Math.max(20, +q.get("size") || (innerWidth < 640 ? 26 : 36))),
  weight: q.get("pen") === "thick" ? "Bold" : "Regular",
  paper: ["ruled", "grid", "dots", "blank", "neon"].includes(q.get("paper")) ? q.get("paper") : "ruled",
  live: q.get("live") !== "0",
};
const playOnOpen = q.get("play") === "1";

function shareParams(play) {
  const p = new URLSearchParams();
  if (state.text !== DEFAULT_TEXT) p.set("t", state.text);
  if (state.ink !== INKS[0]) p.set("ink", state.ink.slice(1));
  if (state.size !== 36) p.set("size", state.size);
  if (state.weight === "Bold") p.set("pen", "thick");
  if (state.paper !== "ruled") p.set("paper", state.paper);
  if (!state.live) p.set("live", "0");
  if (play) p.set("play", "1");
  return p.toString();
}
let urlTimer;
function saveURL() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const h = shareParams(false);
    history.replaceState(null, "", h ? "#" + h : location.pathname + location.search);
  }, 250);
}

function say(msg) {
  status.textContent = msg;
  clearTimeout(say.t);
  say.t = setTimeout(() => (status.textContent = ""), 3200);
}

// ---------- toolbar ----------
function setRadio(groupSel, attr, value) {
  $$(`${groupSel} [${attr}]`).forEach((b) => b.setAttribute("aria-checked", String(b.getAttribute(attr) === value)));
}
function apply() {
  root.style.setProperty("--ink", state.ink);
  root.style.setProperty("--neon", NEON[state.ink]);
  root.style.setProperty("--F", state.size + "px");
  pad.style.fontWeight = state.weight === "Bold" ? 700 : 400;
  document.body.dataset.paper = state.paper;
  setRadio(".toolbar", "data-ink", state.ink);
  setRadio(".toolbar", "data-weight", state.weight);
  setRadio(".toolbar", "data-paper", state.paper);
  $("#size").value = state.size;
  $("#live").setAttribute("aria-pressed", String(state.live));
  grow();
  saveURL();
  renderInk(false);
  updateUrlSnippet();
}
$$("[data-ink]").forEach((b) => b.addEventListener("click", () => { state.ink = b.dataset.ink; apply(); }));
$$(".toolbar [data-weight]").forEach((b) => b.addEventListener("click", () => { state.weight = b.dataset.weight; apply(); getHand(state.weight); }));
$$(".toolbar [data-paper]").forEach((b) => b.addEventListener("click", () => { state.paper = b.dataset.paper; apply(); }));
$("#size").addEventListener("input", (e) => { state.size = +e.target.value; apply(); });
$("#live").addEventListener("click", () => { state.live = !state.live; apply(); pad.focus(); });
// arrow keys move between options inside a radio group
$$('[role="radiogroup"]').forEach((g) => g.addEventListener("keydown", (e) => {
  const items = $$('[role="radio"]', g), i = items.indexOf(document.activeElement);
  if (i < 0 || !["ArrowLeft", "ArrowRight"].includes(e.key)) return;
  const n = items[(i + (e.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
  n.focus(); n.click(); e.preventDefault();
}));

// ---------- the writing page ----------
function grow() {
  pad.style.height = "auto";
  pad.style.height = pad.scrollHeight + "px";
}
pad.value = state.text;
pad.addEventListener("input", () => { state.text = pad.value; grow(); saveURL(); stopReplay(); renderInk(true); });
addEventListener("resize", () => { grow(); renderInk(false); });

// ---------- live ink: the pen draws each new letter as you type ----------
// The textarea stays in charge of the caret and selection; its text is made transparent and the
// real pen strokes are drawn on top. Strokes shared with the previous render stay put; new ones animate.
let inkKeys = [], inkSeq = 0;
async function renderInk(animateNew) {
  const seq = ++inkSeq;
  const body = pad.parentElement;
  if (!state.live) { body.classList.remove("live"); inkLayer.innerHTML = ""; inkKeys = []; return; }
  const hand = await getHand(state.weight);
  if (seq !== inkSeq) return;
  const box = contentBox(), scale = state.size / 1000;
  const { strokes, layout } = hand.penStrokes(pad.value, box.width / scale);
  const keys = strokes.map((s) => s.key);
  let k = 0;
  while (k < keys.length && k < inkKeys.length && keys[k] === inkKeys[k]) k++;
  const fresh = strokes.length - k;
  const animate = animateNew && fresh > 0 && fresh <= 60 && !reduceMotion();
  const timing = animate ? hand.timing(strokes.slice(k), 26) : null;
  const paths = strokes.map((s, i) => {
    const d = Hand.pathData(s);
    if (!animate || i < k) return `<path d="${d}"/>`;
    const j = i - k;
    return `<path class="s" pathLength="1" style="--t:${Math.max(0, timing.start[j] - 0.15).toFixed(3)}s;--d:${timing.dur[j].toFixed(3)}s" d="${d}"/>`;
  }).join("");
  const W = box.width / scale, H = Math.max(layout.height, hand.lineHeight);
  inkLayer.innerHTML = `<svg viewBox="0 0 ${W.toFixed(1)} ${H.toFixed(1)}" width="${box.width}" height="${(H * scale).toFixed(1)}">` +
    `<g fill="none" stroke="currentColor" stroke-width="${hand.m.pen}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
  inkKeys = keys;
  body.classList.add("live");
}

function contentBox() {
  const cs = getComputedStyle(pad);
  return {
    left: parseFloat(cs.paddingLeft), top: parseFloat(cs.paddingTop),
    width: pad.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight),
  };
}

// ---------- replay: the real pen strokes, in the order they were written ----------
let replayTimer = null;
async function replay() {
  if (replayTimer) return stopReplay();
  const hand = await getHand(state.weight);
  const box = contentBox();
  const text = pad.value.trim() ? pad.value : DEFAULT_TEXT;
  const svg = hand.svg(text, { size: state.size, maxWidth: box.width, pad: 0, animate: true, color: "currentColor" });
  layer.innerHTML = svg;
  layer.hidden = false;
  pad.style.visibility = "hidden";
  inkLayer.style.visibility = "hidden";
  $("#replay").textContent = "Stop";
  const reduce = reduceMotion();
  const strokes = hand.penStrokes(text, box.width / (state.size / 1000)).strokes;
  const total = reduce ? 0.6 : hand.timing(strokes).total;
  const top = $("#page").getBoundingClientRect().top;
  if (top < 0 || top > innerHeight * 0.4) $("#page").scrollIntoView({ behavior: reduce ? "auto" : "smooth" });
  replayTimer = setTimeout(stopReplay, (total + 1.2) * 1000);
}
function stopReplay() {
  if (!replayTimer) return;
  clearTimeout(replayTimer);
  replayTimer = null;
  layer.hidden = true;
  layer.innerHTML = "";
  pad.style.visibility = "";
  inkLayer.style.visibility = "";
  $("#replay").textContent = "Watch it write";
}
$("#replay").addEventListener("click", replay);
layer.addEventListener("click", () => { stopReplay(); pad.focus(); });
addEventListener("keydown", (e) => { if (replayTimer && e.key === "Escape") stopReplay(); });

// ---------- exports ----------
function download(blob, name) {
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fileName = () => "stavan-" + (pad.value.trim().split(/\s+/).slice(0, 3).join("-").replace(/[^\w-]/g, "").toLowerCase() || "note");

$("#save-svg").addEventListener("click", async () => {
  closeMenu();
  const hand = await getHand(state.weight);
  const box = contentBox();
  const svg = hand.svg(pad.value || " ", { size: state.size, maxWidth: box.width + 0.8 * state.size, animate: true, color: state.ink, background: "#ffffff" });
  download(new Blob([svg], { type: "image/svg+xml" }), fileName() + ".svg");
  say("Saved. Open the SVG in a browser to watch it write.");
});

$("#save-png").addEventListener("click", async () => {
  closeMenu();
  const hand = await getHand(state.weight);
  const box = contentBox();
  const F = state.size, L = 1.7 * F, k = 2;
  const W = pad.clientWidth;
  const lines = hand.layout(pad.value || " ", box.width / (F / 1000)).lines.length;
  const H = Math.ceil(box.top + lines * L + 1.2 * L);
  const c = Object.assign(document.createElement("canvas"), { width: W * k, height: H * k });
  const ctx = c.getContext("2d");
  ctx.scale(k, k);
  ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
  drawPaper(ctx, W, H, box, F, L);
  inkStyle(ctx);
  const passes = state.paper === "neon" ? 2 : 1;
  for (let i = 0; i < passes; i++) hand.draw(ctx, pad.value, { x: box.left, y: box.top, size: F, maxWidth: box.width, color: ctx.strokeStyle });
  c.toBlob((b) => { download(b, fileName() + ".png"); say("Image saved."); }, "image/png");
});

// ink style for canvas exports; on the neon wall strokes get a white-hot core and a coloured glow
function inkStyle(ctx, scale) {
  if (state.paper !== "neon") { ctx.strokeStyle = state.ink; ctx.shadowBlur = 0; return; }
  ctx.strokeStyle = mix(NEON[state.ink], "#ffffff", 0.55);
  ctx.shadowColor = NEON[state.ink];
  ctx.shadowBlur = 16;
}
function mix(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return "#" + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, "0")).join("");
}
function drawNeonWall(ctx, W, H) {
  ctx.fillStyle = "#1b181c"; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = "#121014"; ctx.lineWidth = 3;
  for (let y = 0, row = 0; y < H; y += 30, row++) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    for (let x = row % 2 ? -30 : 0; x < W; x += 60) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 30); ctx.stroke(); }
  }
  const g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
  g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.55)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
}

function drawPaper(ctx, W, H, box, F, L) {
  if (state.paper === "neon") return drawNeonWall(ctx, W, H);
  const css = getComputedStyle(root);
  const base = box.top + 1.05 * F + 1;
  ctx.save();
  if (state.paper === "ruled" || state.paper === "grid") {
    const step = state.paper === "grid" ? L / 2 : L;
    ctx.strokeStyle = css.getPropertyValue(state.paper === "grid" ? "--grid" : "--rule").trim();
    ctx.lineWidth = 1.25;
    for (let y = base % step; y < H; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    if (state.paper === "grid") for (let x = box.left % step; x < W; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
  } else if (state.paper === "dots") {
    const step = L / 2;
    ctx.fillStyle = css.getPropertyValue("--dot").trim();
    for (let y = (base - 1) % step; y < H; y += step)
      for (let x = box.left % step; x < W; x += step) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, 7); ctx.fill(); }
  }
  ctx.restore();
}

$("#share").addEventListener("click", async () => {
  state.text = pad.value;
  const url = `${location.origin}${location.pathname}#${shareParams(true)}`;
  try { await navigator.clipboard.writeText(url); say("Link copied. Whoever opens it will watch your note being written."); }
  catch { prompt("Copy this link:", url); }
});

// ---------- video: record the page writing itself ----------
let recording = false;
$("#save-video").addEventListener("click", async () => {
  closeMenu();
  if (recording) return;
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return say("This browser can't record video. Try Chrome, Edge or Safari.");
  const types = ["video/mp4;codecs=avc1.42E01E", "video/mp4", "video/webm;codecs=vp9", "video/webm"];
  const mime = types.find((t) => MediaRecorder.isTypeSupported(t));
  if (!mime) return say("This browser can't record video. Try Chrome, Edge or Safari.");
  recording = true;
  const hand = await getHand(state.weight);
  const box = contentBox();
  const F = state.size, L = 1.7 * F, k = 2, W = pad.clientWidth;
  const text = pad.value.trim() ? pad.value : DEFAULT_TEXT;
  const { strokes, layout } = hand.penStrokes(text, box.width / (F / 1000));
  const H = Math.ceil(box.top + layout.lines.length * L + 1.2 * L);
  const c = Object.assign(document.createElement("canvas"), { width: Math.round((W * k) / 2) * 2, height: Math.round((H * k) / 2) * 2 });
  const ctx = c.getContext("2d");
  const timing = hand.timing(strokes);
  const total = timing.total + 1.5;
  const frame = (t) => {
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, W, H);
    drawPaper(ctx, W, H, box, F, L);
    ctx.save();
    ctx.translate(box.left, box.top);
    ctx.scale(F / 1000, F / 1000);
    inkStyle(ctx);
    ctx.lineWidth = hand.m.pen; ctx.lineCap = ctx.lineJoin = "round";
    hand.drawAt(ctx, strokes, timing, t);
    if (state.paper === "neon") hand.drawAt(ctx, strokes, timing, t);
    ctx.restore();
  };
  frame(0);
  const rec = new MediaRecorder(c.captureStream(60), { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  const stopped = new Promise((r) => (rec.onstop = r));
  rec.start();
  const t0 = performance.now();
  await new Promise((done) => {
    const tick = () => {
      const t = (performance.now() - t0) / 1000;
      frame(t);
      say(`Recording the video, ${Math.max(0, Math.ceil(total - t))} s left. Keep this tab open.`);
      if (t < total) requestAnimationFrame(tick); else done();
    };
    requestAnimationFrame(tick);
  });
  rec.stop();
  await stopped;
  download(new Blob(chunks, { type: mime.split(";")[0] }), fileName() + (mime.includes("mp4") ? ".mp4" : ".webm"));
  say("Video saved.");
  recording = false;
});

// ---------- notebook PDF and 3D print ----------
$("#save-pdf").addEventListener("click", async () => {
  closeMenu();
  const hand = await getHand(state.weight);
  const paper = state.paper === "neon" ? "ruled" : state.paper;
  const title = pad.value.trim().split("\n")[0].slice(0, 60) || "Notes";
  const blob = await notebookPDF(hand, pad.value, { ink: state.ink, paper, title });
  download(blob, fileName() + ".pdf");
  say("Notebook saved. Import the PDF into GoodNotes or any notes app.");
});
$("#save-stl").addEventListener("click", async () => {
  closeMenu();
  const hand = await getHand(state.weight);
  const text = pad.value.trim() ? pad.value : "Stavan";
  const lines = hand.layout(text, 180 / (12 / (1.75 * hand.m.xh)) ).lines.length;
  if (lines > 12) say("That's a lot of text for a print. The STL is ready, but a short word or name prints best.");
  download(stlFromText(hand, text), fileName() + ".stl");
  if (lines <= 12) say("STL saved. Open it in any slicer; letters are about 12 mm tall.");
});

// ---------- save menu ----------
const menu = $("#save-menu");
function closeMenu() { menu.open = false; }
document.addEventListener("click", (e) => { if (menu.open && !menu.contains(e.target)) closeMenu(); });
menu.addEventListener("keydown", (e) => { if (e.key === "Escape") { closeMenu(); menu.querySelector("summary").focus(); } });


// ---------- drawing helpers for stroke lists (font units, y up, baseline 0) ----------
const r1 = (v) => Math.round(v);
function strokesSVG(list, { pen, hl = null, top = 1350, bottom = 600, label = "" }) {
  let x0 = Infinity, x1 = -Infinity;
  for (const s of list) for (let i = 0; i < s.length; i += 2) { x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); }
  if (!isFinite(x0)) { x0 = 0; x1 = 100; }
  const m = pen;
  const path = (s) => {
    let d = "";
    for (let i = 0; i < s.length; i += 2) d += (i ? "L" : "M") + r1(s[i]) + " " + r1(-s[i + 1]);
    return s.length === 2 ? d + "l.1 0" : d;
  };
  const parts = list.map((s, i) => `<path d="${path(s)}"${hl && !hl.has(i) ? ' class="faint"' : ""}/>`).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${r1(x0 - m)} ${-top} ${r1(x1 - x0 + 2 * m)} ${top + bottom}" role="img" aria-label="${label}">` +
    `<g fill="none" stroke="currentColor" stroke-width="${pen}" stroke-linecap="round" stroke-linejoin="round">${parts}</g></svg>`;
}
function fontStrokes(hand, text) {
  const out = [];
  for (const g of hand.shape(text).glyphs) {
    if (!g.name) continue;
    const dx = g.x + hand.m.dx[g.name];
    for (const s of hand.strokes[g.name] || []) out.push(s.map((v, i) => (i % 2 ? v : v + dx)));
  }
  return out;
}

// ---------- where each letter came from ----------
async function setupOrigins() {
  const hand = await getHand("Regular");
  const chars = Object.keys(hand.m.cmap);
  const rank = (c) => (/[a-z]/.test(c) ? 0 : /[A-Z]/.test(c) ? 1 : /[0-9]/.test(c) ? 2 : /[\x21-\x7e]/.test(c) ? 3 : 4);
  chars.sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));
  const picker = $("#picker");
  picker.innerHTML = chars.filter((c) => rank(c) < 4).map((c) =>
    `<button role="option" aria-selected="false" data-ch="${c.replace(/"/g, "&quot;").replace(/&/g, "&amp;")}" aria-label="${c === '"' ? "double quote" : c}">${c.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</button>`).join("");
  picker.addEventListener("click", (e) => { const b = e.target.closest("button"); if (b) show(b.dataset.ch); });
  picker.addEventListener("keydown", (e) => {
    const items = $$("button", picker), i = items.indexOf(document.activeElement);
    if (i < 0) return;
    const d = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (d) { const n = items[(i + d + items.length) % items.length]; n.focus(); show(n.dataset.ch); e.preventDefault(); }
  });

  async function show(ch) {
    $$("button", picker).forEach((b) => b.setAttribute("aria-selected", String(b.dataset.ch === ch)));
    const base = hand.m.cmap[ch];
    const names = [base, 1, 2, 3, 4].map((i) => (i === base ? base : `${base}.alt${i}`)).filter((n) => n in hand.strokes);
    const seen = new Set();
    const uniq = names.filter((n) => { const k = JSON.stringify(hand.strokes[n]); if (seen.has(k)) return false; seen.add(k); return true; });
    const W = await getWords();
    const out = $("#origins");
    const rows = uniq.map((n) => {
      const glyph = strokesSVG(hand.strokes[n], { pen: hand.m.pen, label: ch });
      const src = W.sources[n];
      if (!src) return null;
      const [wi, ks] = src, w = W.words[wi];
      const word = strokesSVG(w.s, { pen: hand.m.pen, hl: new Set(ks), label: w.t || "word from the notes" });
      const cap = w.t ? `from “${w.t}”` : "from an untranscribed word, found by shape search";
      return `<div class="origin"><div class="glyph">${glyph}</div><div class="word">${word}<p class="cap">${cap}</p></div></div>`;
    }).filter(Boolean);
    out.innerHTML = rows.length ? rows.join("") :
      `<div class="origin"><div class="glyph">${strokesSVG(hand.strokes[base], { pen: hand.m.pen, label: ch })}</div>` +
      `<p class="built">This one never shows up in my notes, so it was built from pieces of my own strokes.</p></div>`;
  }
  show("g");
}

// ---------- real or font? ----------
async function setupGame() {
  const [hand, W] = await Promise.all([getHand("Regular"), getWords()]);
  const order = [...W.game].sort(() => Math.random() - 0.5);
  let n = 0, right = 0, played = 0, realSide = 0;
  const [A, B] = $$(".choice");
  function deal() {
    const w = W.words[order[n++ % order.length]];
    realSide = Math.random() < 0.5 ? 0 : 1;
    const real = strokesSVG(w.s, { pen: hand.m.pen, top: 1250, bottom: 650, label: "" });
    const fake = strokesSVG(fontStrokes(hand, w.t), { pen: hand.m.pen, top: 1250, bottom: 650, label: "" });
    [A, B].forEach((el, i) => {
      el.innerHTML = i === realSide ? real : fake;
      el.disabled = false;
      el.className = "choice";
      el.setAttribute("aria-label", `${i ? "Right" : "Left"} version of “${w.t}”`);
    });
    $("#game-result").textContent = "";
    $("#game-next").hidden = true;
  }
  function pick(i) {
    played++;
    const ok = i === realSide;
    if (ok) right++;
    [A, B].forEach((el, j) => {
      el.disabled = true;
      el.classList.toggle("is-real", j === realSide);
      el.classList.toggle("picked", j === i);
      el.insertAdjacentHTML("beforeend", `<span class="tag">${j === realSide ? "Real, from my notes" : "The font"}</span>`);
    });
    $("#game-result").textContent = `${ok ? "Right." : "Nope, that one is the font."} ${right} of ${played} so far.`;
    $("#game-next").hidden = false;
    $("#game-next").focus({ preventScroll: true });
  }
  A.addEventListener("click", () => pick(0));
  B.addEventListener("click", () => pick(1));
  $("#game-next").addEventListener("click", deal);
  deal();
}

// ---------- snippets and bookmarklet ----------
$("#css-snippet").textContent =
  `<link rel="stylesheet" href="${SITE}/dist/stavan.css">\n<p class="stavan">Hello in my handwriting</p>`;
$("#js-snippet").textContent =
  `import { load } from "${SITE}/stavan.js";\n\nconst hand = await load("${SITE}/data/");\nconst svg = hand.svg("hello there", { size: 64, animate: true, color: "#007aff" });\ndocument.body.insertAdjacentHTML("beforeend", svg);`;
$$(".copy").forEach((b) => b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#" + b.dataset.copy).textContent); b.textContent = "Copied"; }
  catch { b.textContent = "Select and copy"; }
  setTimeout(() => (b.textContent = "Copy"), 1600);
}));
const bm = `(()=>{const d=document,l=d.createElement('link');l.rel='stylesheet';l.href='${SITE}/dist/stavan.css';` +
  `d.head.append(l);const s=d.createElement('style');s.textContent='body,body *:not(code):not(pre):not(kbd):not(samp):not(svg *):not([class*=icon]):not([class*=Icon]){font-family:Stavan,cursive!important}';d.head.append(s)})()`;
$("#bookmarklet").href = "javascript:" + encodeURIComponent(bm);
$("#bookmarklet").addEventListener("click", (e) => { e.preventDefault(); say("Drag that button to your bookmarks bar, then click it on any site."); });

function updateUrlSnippet() {
  const t = "hello from my README";
  const url = `${SITE}/write.svg?text=${encodeURIComponent(t)}&color=${state.ink.slice(1)}`;
  $("#url-snippet").textContent = `![${t}](${url})`;
  const img = $("#url-preview img") || $("#url-preview").appendChild(Object.assign(document.createElement("img"), { alt: t, height: 70 }));
  if (img.dataset.src !== url) { img.dataset.src = url; img.src = url; }
}

// ---------- start ----------
apply();
document.fonts.ready.then(() => { grow(); renderInk(false); });
if (playOnOpen) {
  // opened from "Send as a note": write the note out for the reader
  Promise.all([getHand(state.weight), document.fonts.ready]).then(() => setTimeout(replay, 1300));
}
getHand("Regular").then((hand) => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#title").innerHTML = hand.svg("Stavan", { size: 54, pad: 0, animate: !reduce, speed: 6, color: "currentColor" });
}).catch((e) => say(e.message));
setupOrigins().catch((e) => say(e.message));
setupGame().catch((e) => say(e.message));
