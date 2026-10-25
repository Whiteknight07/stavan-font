import { load } from "../stavan.js";

const $ = (s) => document.querySelector(s);
const INKS = ["#000000", "#d10000", "#007aff", "#f49923", "#636363", "#82218c"];
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

const [page, hand] = await Promise.all([fetch("data/page.json").then((r) => r.json()), load("data/", "Regular")]);
$("#how-title").innerHTML = hand.svg("from notes to a font", { size: 54, pad: 0, animate: !reduce, speed: 8, color: "#000" });
$("#n-strokes").textContent = page.strokes.length;
$("#n-words").textContent = page.words.length;

// ---------- the page ----------
const svg = $("#page-svg");
const pad = 12;
svg.setAttribute("viewBox", `${-pad} ${-pad} ${page.w + 2 * pad} ${page.h + 2 * pad}`);
const keptKey = new Set(page.picked.map((p) => `${p.w}:${p.g}`));
const d = (flat) => {
  let s = "";
  for (let i = 0; i < flat.length; i += 2) s += (i ? "L" : "M") + flat[i] + " " + flat[i + 1];
  return flat.length === 2 ? s + "l.1 0" : s;
};
let html = "";
page.strokes.forEach((st, i) => {
  const kept = keptKey.has(`${page.strokeWord[i]}:${page.strokeGroup[i]}`);
  html += `<path class="pst${kept ? " kept" : ""}" style="--c:${INKS[i % INKS.length]}" stroke-width="${Math.max(page.pen, 3.2)}" d="${d(st)}"/>`;
});
for (const w of page.words) {
  const [x, y, ww, hh] = w.b;
  html += `<rect class="wbox" x="${x - 4}" y="${y - 4}" width="${ww + 8}" height="${hh + 8}"/>`;
  for (const g of w.g) {
    const [gx, gy, gw, gh] = g.b;
    html += `<rect class="lbox" x="${gx - 2}" y="${gy - 2}" width="${gw + 4}" height="${gh + 4}"/>`;
    if (g.c) html += `<text class="lab" x="${gx + gw / 2}" y="${gy - 5}" text-anchor="middle">${g.c.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>`;
  }
}
for (const p of page.picked) {
  const [x, y, w, h] = page.words[p.w].g[p.g].b;
  html += `<rect class="pick" x="${x - 6}" y="${y - 6}" width="${w + 12}" height="${h + 12}"/>`;
}
svg.innerHTML = html;

// write the page out once, quickly, the first time it comes into view
function writePage() {
  if (reduce) return;
  const paths = [...svg.querySelectorAll(".pst")];
  const per = Math.min(14, 5200 / paths.length);
  paths.forEach((p, i) => {
    const len = p.getTotalLength() || 1;
    p.style.strokeDasharray = `${len} ${len}`;
    p.style.strokeDashoffset = len;
    p.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: 160, delay: i * per, fill: "forwards", easing: "linear" })
      .finished.then(() => { p.style.strokeDasharray = ""; p.style.strokeDashoffset = ""; });
  });
}

// ---------- the font row: each kept letter with its five versions ----------
const row = $("#glyph-row");
const glyphSVG = (name, here) => {
  const st = hand.strokes[name] || [];
  let x0 = Infinity, x1 = -Infinity;
  for (const s of st) for (let i = 0; i < s.length; i += 2) { x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); }
  const pen = hand.m.pen;
  const path = st.map((s) => d(s.map((v, i) => (i % 2 ? -v : v)))).join("");
  return `<svg class="${here ? "here" : ""}" viewBox="${x0 - pen} -1300 ${x1 - x0 + 2 * pen} 1900"><path d="${path}" fill="none" stroke="currentColor" stroke-width="${pen}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};
row.innerHTML = page.picked.map((p) => {
  const base = hand.m.cmap[p.ch];
  const names = [base, ...[1, 2, 3, 4].map((k) => `${base}.alt${k}`)];
  return `<div class="glyph-card"><p>${p.ch}</p><div class="vers">${names.map((n) => glyphSVG(n, n === p.glyph)).join("")}</div></div>`;
}).join("") + `<p class="row-note">In each group, the black version came from this page.</p>`;

// ---------- scroll steps ----------
const fig = $("#fig");
let wrote = false;
const io = new IntersectionObserver((entries) => {
  for (const e of entries) {
    if (!e.isIntersecting) continue;
    document.querySelectorAll(".step").forEach((s) => s.classList.toggle("on", s === e.target));
    fig.dataset.step = e.target.dataset.step;
    if (!wrote) { wrote = true; if (e.target.dataset.step === "1") writePage(); }  // only animate from the start
  }
}, { rootMargin: "-45% 0px -45% 0px" });
document.querySelectorAll(".step").forEach((s) => io.observe(s));
