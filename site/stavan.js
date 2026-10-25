// stavan.js — lays out text with the Stavan font's own data and draws it with the real pen strokes.
// The layout mirrors the font's OpenType features exactly: `calt` (5-slot variant rotation that carries
// across spaces) and `kern`. So a replay lands where the font would put each letter.
//
//   const hand = await Stavan.load("data/", "Regular");
//   hand.svg("hello", { size: 64, animate: true })   // -> SVG string, pen-drawn stroke by stroke
//   hand.draw(ctx, "hello", { size: 64 })           // -> canvas

const cache = {};
const getJSON = (url) => (cache[url] ||= fetch(url).then((r) => {
  if (!r.ok) throw new Error(`Could not load ${url} (${r.status})`);
  return r.json();
}));

export async function load(base = "data/", weight = "Regular") {
  const [meta, strokes] = await Promise.all([getJSON(`${base}stavan-${weight}.json`), getJSON(`${base}strokes.json`)]);
  return new Hand(meta, strokes, weight);
}

export class Hand {
  constructor(meta, strokes, weight) {
    this.m = meta;
    this.strokes = strokes;
    this.weight = weight;
    this.lineHeight = 1.7 * meta.upm; // matches the CSS line-height used on the site
  }

  has(ch) { return ch === " " || ch in this.m.cmap; }

  // One paragraph -> glyph runs. Mirrors `sub @s{k} @s0' by @s{k+1}` + class kerning.
  shape(text) {
    const { cmap, adv, kern, slots } = this.m;
    const out = [];
    let x = 0, prevSlot = -1, prevCh = null;
    for (const ch of text) {
      const base = ch === " " ? "space" : cmap[ch];
      if (!base) { // not in the font: leave a gap the width of a space, break the rotation
        out.push({ ch, name: null, x }); x += adv.space; prevSlot = -1; prevCh = null; continue;
      }
      const cycles = base === "space" || `${base}.alt1` in adv;
      let slot = 0;
      if (cycles && prevSlot >= 0 && prevSlot < slots - 1) slot = prevSlot + 1;
      const name = slot ? `${base}.alt${slot}` : base;
      const k = prevCh && kern[prevCh] && kern[prevCh][ch];
      if (k && out.length) x += k;
      out.push({ ch, name, x });
      x += adv[name];
      prevSlot = cycles ? slot : -1;
      prevCh = ch === " " ? null : ch;
    }
    return { glyphs: out, width: x };
  }

  // Text -> lines (font units). Wraps like a browser textarea when maxWidth (font units) is given:
  // at spaces (which hang at the line end), after a hyphen between letters, around dashes, and
  // mid-word only when a word is wider than the line. All versions of a letter share one width,
  // so where lines break never depends on which version was picked.
  layout(text, maxWidth = Infinity) {
    const lines = [];
    const adv = (g) => this.m.adv[g.name] || this.m.adv.space;
    for (const para of String(text).replace(/\r/g, "").split("\n")) {
      const { glyphs } = this.shape(para);
      const chars = glyphs.map((g) => g.ch);
      let start = 0;
      if (!glyphs.length) { lines.push({ glyphs: [], width: 0 }); continue; }
      while (start < glyphs.length) {
        const x0 = glyphs[start].x;
        let cand = null, over = -1;
        for (let i = start; i < glyphs.length; i++) {
          const ch = chars[i];
          if (ch === " ") { cand = { end: i, next: i + 1 }; continue; }
          if (ch === "\u2014" && i > start) cand = { end: i, next: i };              // before an em dash
          if (glyphs[i].x + adv(glyphs[i]) - x0 > maxWidth && i > start) { over = i; break; }
          const prev = chars[i - 1] || "", next = chars[i + 1] || "";
          if ((ch === "-" && /\p{L}/u.test(prev) && next && !/[0-9\s]/.test(next)) || ch === "\u2013" || ch === "\u2014")
            cand = { end: i + 1, next: i + 1 };                                        // after a hyphen or dash
        }
        if (over < 0) { lines.push(this._slice(glyphs, start, glyphs.length)); break; }
        if (!cand || cand.next <= start) cand = { end: over, next: over };           // word longer than the line
        lines.push(this._slice(glyphs, start, cand.end));
        start = cand.next;
        while (chars[start] === " ") start++;                                          // extra spaces hang too
      }
    }
    const width = Math.max(0, ...lines.map((l) => l.width));
    return { lines, width, height: lines.length * this.lineHeight };
  }

  _slice(glyphs, a, b) {
    const part = glyphs.slice(a, b);
    while (part.length && part[part.length - 1].ch === " ") part.pop();
    if (!part.length) return { glyphs: [], width: 0 };
    const x0 = part[0].x;
    const g = part.map((p) => ({ ...p, x: p.x - x0 }));
    const last = g[g.length - 1];
    return { glyphs: g, width: last.x + (this.m.adv[last.name] || this.m.adv.space) };
  }

  // Every pen stroke in writing order, positioned in font units (y down, top of first line = 0).
  penStrokes(text, maxWidth = Infinity) {
    const L = this.layout(text, maxWidth);
    const base0 = (this.lineHeight - (this.m.asc - this.m.desc)) / 2 + this.m.asc; // baseline inside a line box
    const out = [];
    L.lines.forEach((line, li) => {
      const by = li * this.lineHeight + base0;
      let word = 0;
      for (const g of line.glyphs) {
        if (g.ch === " ") { word++; continue; }
        if (!g.name) continue;
        const dx = g.x + this.m.dx[g.name];
        const glyphStrokes = this.strokes[g.name] || [];
        glyphStrokes.forEach((flat, si) => {
          const pts = [];
          for (let i = 0; i < flat.length; i += 2) pts.push([dx + flat[i], by - flat[i + 1]]);
          out.push({ pts, line: li, word, ch: g.ch, first: si === 0, key: `${li}:${Math.round(g.x)}:${g.name}:${si}` });
        });
      }
    });
    return { strokes: out, layout: L };
  }

  // SVG string. Options: size (px per em), color, maxWidth (px), pad (px), animate, speed (x-heights/sec),
  // background (CSS color or null), tight (crop height to the ink).
  svg(text, o = {}) {
    const size = o.size ?? 64, color = o.color ?? "#000", pad = o.pad ?? 0.2 * size;
    const scale = size / this.m.upm;
    const maxW = o.maxWidth ? (o.maxWidth - 2 * pad) / scale : Infinity;
    const { strokes, layout } = this.penStrokes(text, maxW);
    const padU = pad / scale;
    const pen = o.pen ?? this.m.pen;
    let W = layout.width + 2 * padU, H = layout.height + 2 * padU, y0 = 0;
    if (o.tight && strokes.length) { // crop the height to the ink instead of whole line boxes
      let lo = Infinity, hi = -Infinity;
      for (const st of strokes) for (const p of st.pts) { lo = Math.min(lo, p[1]); hi = Math.max(hi, p[1]); }
      y0 = lo - pen / 2;
      H = hi - lo + pen + 2 * padU;
    }
    const r = (v) => Math.round(v * 10) / 10;
    const d = (s) => "M" + s.pts.map((p) => `${r(p[0] + padU)} ${r(p[1] + padU - y0)}`).join("L");
    const timing = o.animate ? this.timing(strokes, o.speed) : null;
    let style = "", paths = "";
    if (timing) {
      style = `<style>.s{stroke-dasharray:1 2;stroke-dashoffset:1;opacity:0;animation:w var(--d) linear var(--t) forwards}` +
        `@keyframes w{0%{opacity:1;stroke-dashoffset:1}100%{opacity:1;stroke-dashoffset:0}}` +
        `@media (prefers-reduced-motion:reduce){.s{animation:none;opacity:1;stroke-dashoffset:0}}</style>`;
      paths = strokes.map((s, i) =>
        `<path class="s" pathLength="1" style="--t:${timing.start[i].toFixed(3)}s;--d:${timing.dur[i].toFixed(3)}s" d="${d(s)}"/>`).join("");
    } else {
      paths = strokes.map((s) => `<path d="${d(s)}"/>`).join("");
    }
    const bg = o.background ? `<rect width="100%" height="100%" fill="${o.background}"/>` : "";
    const label = String(text).replace(/[<&"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", '"': "&quot;" }[c]));
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${r(W)} ${r(H)}" width="${r(W * scale)}" height="${r(H * scale)}" role="img" aria-label="${label}">` +
      `${style}${bg}<g class="all" fill="none" stroke="${color}" stroke-width="${r(pen)}" stroke-linecap="round" stroke-linejoin="round">${paths}</g></svg>`;
  }

  // SVG path data for one positioned stroke (as returned by penStrokes), offset by (ox, oy) font units.
  static pathData(s, ox = 0, oy = 0) {
    const r = (v) => Math.round(v * 10) / 10;
    const d = "M" + s.pts.map((p) => `${r(p[0] + ox)} ${r(p[1] + oy)}`).join("L");
    return s.pts.length === 1 ? d + "l.1 0" : d;
  }

  // Draw strokes as they look `t` seconds into a replay (partially drawn strokes are cut by length).
  drawAt(ctx, strokes, timing, t) {
    for (let i = 0; i < strokes.length; i++) {
      const start = timing.start[i];
      if (t <= start) break;
      const pts = strokes[i].pts;
      const f = Math.min(1, (t - start) / timing.dur[i]);
      ctx.beginPath();
      ctx.moveTo(...pts[0]);
      if (pts.length === 1) { ctx.lineTo(pts[0][0] + 0.1, pts[0][1]); ctx.stroke(); continue; }
      let total = 0;
      for (let j = 1; j < pts.length; j++) total += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
      let left = total * f;
      for (let j = 1; j < pts.length && left > 0; j++) {
        const seg = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
        if (seg <= left) { ctx.lineTo(...pts[j]); left -= seg; continue; }
        const k = left / seg;
        ctx.lineTo(pts[j - 1][0] + (pts[j][0] - pts[j - 1][0]) * k, pts[j - 1][1] + (pts[j][1] - pts[j - 1][1]) * k);
        left = 0;
      }
      ctx.stroke();
    }
  }

  // Pen timing: constant pen speed, short lifts between strokes, longer ones between words and lines.
  timing(strokes, speed = 13) {
    const unitsPerSec = speed * this.m.xh;
    const start = [], dur = [];
    let t = 0.15, prev = null;
    for (const s of strokes) {
      if (prev) t += s.line !== prev.line ? 0.3 : s.word !== prev.word ? 0.12 : s.first ? 0.04 : 0.025;
      let len = 0;
      for (let i = 1; i < s.pts.length; i++) len += Math.hypot(s.pts[i][0] - s.pts[i - 1][0], s.pts[i][1] - s.pts[i - 1][1]);
      const dt = Math.max(0.035, len / unitsPerSec);
      start.push(t); dur.push(dt); t += dt; prev = s;
    }
    return { start, dur, total: t };
  }

  // Draw onto a canvas 2D context at (x, y) = top-left. Returns the drawn size in px.
  draw(ctx, text, o = {}) {
    const size = o.size ?? 64, scale = size / this.m.upm;
    const maxW = o.maxWidth ? o.maxWidth / scale : Infinity;
    const { strokes, layout } = this.penStrokes(text, maxW);
    ctx.save();
    ctx.translate(o.x || 0, o.y || 0);
    ctx.scale(scale, scale);
    ctx.strokeStyle = o.color ?? "#000";
    ctx.lineWidth = o.pen ?? this.m.pen;
    ctx.lineCap = ctx.lineJoin = "round";
    for (const s of strokes.slice(0, o.upTo ?? strokes.length)) {
      ctx.beginPath();
      ctx.moveTo(...s.pts[0]);
      if (s.pts.length === 1) ctx.lineTo(s.pts[0][0] + 0.1, s.pts[0][1]);
      for (const p of s.pts.slice(1)) ctx.lineTo(...p);
      ctx.stroke();
    }
    ctx.restore();
    return { width: layout.width * scale, height: layout.height * scale };
  }
}
