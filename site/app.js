import { load } from "./stavan.js";

const CDN = "https://cdn.jsdelivr.net/gh/Whiteknight07/stavan-font@1";
const DEFAULT_TEXT = `Hi, this is my handwriting, typed.
Every letter here was cut out of real Apple Pencil strokes from my lecture notes. Each one has five versions that take turns as you type, so no two words come out the same.
This page is yours now. Type over it.`;
const INKS = ["#000000", "#d10000", "#007aff", "#f49923", "#636363", "#82218c"];

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const root = document.documentElement;
const pad = $("#pad"), layer = $("#replay-layer"), status = $("#status");

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
  paper: ["ruled", "grid", "dots", "blank"].includes(q.get("paper")) ? q.get("paper") : "ruled",
};
let urlTimer;
function saveURL() {
  clearTimeout(urlTimer);
  urlTimer = setTimeout(() => {
    const p = new URLSearchParams();
    if (state.text !== DEFAULT_TEXT) p.set("t", state.text);
    if (state.ink !== INKS[0]) p.set("ink", state.ink.slice(1));
    if (state.size !== 36) p.set("size", state.size);
    if (state.weight === "Bold") p.set("pen", "thick");
    if (state.paper !== "ruled") p.set("paper", state.paper);
    const h = p.toString();
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
  root.style.setProperty("--F", state.size + "px");
  pad.style.fontWeight = state.weight === "Bold" ? 700 : 400;
  document.body.dataset.paper = state.paper;
  setRadio(".toolbar", "data-ink", state.ink);
  setRadio(".toolbar", "data-weight", state.weight);
  setRadio(".toolbar", "data-paper", state.paper);
  $("#size").value = state.size;
  grow();
  saveURL();
}
$$("[data-ink]").forEach((b) => b.addEventListener("click", () => { state.ink = b.dataset.ink; apply(); }));
$$(".toolbar [data-weight]").forEach((b) => b.addEventListener("click", () => { state.weight = b.dataset.weight; apply(); getHand(state.weight); }));
$$(".toolbar [data-paper]").forEach((b) => b.addEventListener("click", () => { state.paper = b.dataset.paper; apply(); }));
$("#size").addEventListener("input", (e) => { state.size = +e.target.value; apply(); });
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
pad.addEventListener("input", () => { state.text = pad.value; grow(); saveURL(); stopReplay(); });
addEventListener("resize", grow);

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
  $("#replay").textContent = "Stop";
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
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
  const hand = await getHand(state.weight);
  const box = contentBox();
  const svg = hand.svg(pad.value || " ", { size: state.size, maxWidth: box.width + 0.8 * state.size, animate: true, color: state.ink, background: "#ffffff" });
  download(new Blob([svg], { type: "image/svg+xml" }), fileName() + ".svg");
  say("Saved. Open the SVG in a browser to watch it write.");
});

$("#save-png").addEventListener("click", async () => {
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
  hand.draw(ctx, pad.value, { x: box.left, y: box.top, size: F, maxWidth: box.width, color: state.ink });
  c.toBlob((b) => { download(b, fileName() + ".png"); say("Image saved."); }, "image/png");
});

function drawPaper(ctx, W, H, box, F, L) {
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
  clearTimeout(urlTimer);
  state.text = pad.value; saveURL();
  await new Promise((r) => setTimeout(r, 300));
  try { await navigator.clipboard.writeText(location.href); say("Link copied. It opens this page with your text."); }
  catch { say("Copy this page's address to share it."); }
});

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
  `<link rel="stylesheet" href="${CDN}/dist/stavan.css">\n<p class="stavan">Hello in my handwriting</p>`;
$("#js-snippet").textContent =
  `import { load } from "${CDN}/site/stavan.js";\n\nconst hand = await load("${CDN}/site/data/");\nconst svg = hand.svg("hello there", { size: 64, animate: true, color: "#007aff" });\ndocument.body.insertAdjacentHTML("beforeend", svg);`;
$$(".copy").forEach((b) => b.addEventListener("click", async () => {
  try { await navigator.clipboard.writeText($("#" + b.dataset.copy).textContent); b.textContent = "Copied"; }
  catch { b.textContent = "Select and copy"; }
  setTimeout(() => (b.textContent = "Copy"), 1600);
}));
const bm = `(()=>{const d=document,l=d.createElement('link');l.rel='stylesheet';l.href='${CDN}/dist/stavan.css';` +
  `d.head.append(l);const s=d.createElement('style');s.textContent='body,body *:not(code):not(pre):not(kbd):not(samp):not(svg *):not([class*=icon]):not([class*=Icon]){font-family:Stavan,cursive!important}';d.head.append(s)})()`;
$("#bookmarklet").href = "javascript:" + encodeURIComponent(bm);
$("#bookmarklet").addEventListener("click", (e) => { e.preventDefault(); say("Drag that button to your bookmarks bar, then click it on any site."); });

// ---------- start ----------
apply();
document.fonts.ready.then(grow);
getHand("Regular").then((hand) => {
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  $("#title").innerHTML = hand.svg("Stavan", { size: 54, pad: 0, animate: !reduce, speed: 6, color: "currentColor" });
}).catch((e) => say(e.message));
setupOrigins().catch((e) => say(e.message));
setupGame().catch((e) => say(e.message));
