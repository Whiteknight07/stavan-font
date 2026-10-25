// fontmaker.js — turns hand-drawn pen strokes into (1) data for the stavan.js replay engine and
// (2) a real OpenType font with the same rotating-versions feature (calt) as Stavan. Runs in the
// browser and in Node; pass in the opentype.js module.
//
// drawings: { "a": [ [stroke, stroke...], [another version...] ], ... }
// stroke:   flat [x0, y0, x1, y1, ...] in font units, baseline y = 0, y up, x-height = XH units.

export const UPM = 1000;
export const XH = 440;              // font units per x-height, same as Stavan
export const ASC = 950, DESC = -550;
const SB = 0.13 * XH;              // side bearing either side of the ink
const SPACE = 0.78 * XH;

export const glyphName = (ch) => "uni" + ch.codePointAt(0).toString(16).toUpperCase().padStart(4, "0");
const cycles = (ch) => /[\p{L}\p{N}]/u.test(ch);

// Ramer-Douglas-Peucker on a flat array, returns array of [x, y]
function simplify(flat, eps) {
  const pts = [];
  for (let i = 0; i < flat.length; i += 2) {
    const p = [flat[i], flat[i + 1]];
    const q = pts[pts.length - 1];
    if (!q || Math.hypot(p[0] - q[0], p[1] - q[1]) > 0.5) pts.push(p);
  }
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, n = Math.hypot(dx, dy) || 1;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs(dx * (pts[i][1] - ay) - dy * (pts[i][0] - ax)) / n;
      if (d > best) { best = d; bi = i; }
    }
    if (best > eps) { keep[bi] = 1; stack.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

// One stroke -> polygons: a round-ended capsule per segment (a circle for a dot). The capsules of a glyph
// are merged into one clean outline with a polygon union, so nothing overlaps in the final font.
function strokePolygons(flat, r) {
  const pts = simplify(flat, 2.5);
  const arc = (ring, cx, cy, a0, a1) => {
    const steps = Math.max(2, Math.ceil(Math.abs(a1 - a0) / (Math.PI / 10)));
    for (let i = 0; i <= steps; i++) {
      const a = a0 + ((a1 - a0) * i) / steps;
      ring.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
  };
  const out = [];
  const dot = (cx, cy) => { const ring = []; arc(ring, cx, cy, 0, 2 * Math.PI - Math.PI / 10); ring.push(ring[0]); out.push([ring]); };
  if (pts.length === 1) { dot(...pts[0]); return out; }
  let drew = false;
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1], [bx, by] = pts[i];
    if (Math.hypot(bx - ax, by - ay) < 0.5) continue;
    const t = Math.atan2(by - ay, bx - ax);
    const ring = [];
    arc(ring, bx, by, t - Math.PI / 2, t + Math.PI / 2);          // round end
    arc(ring, ax, ay, t + Math.PI / 2, t + 1.5 * Math.PI);        // round start
    ring.push(ring[0]);
    out.push([ring]);
    drew = true;
  }
  if (!drew) dot(...pts[0]);
  return out;
}

// Merged outline of one glyph: list of closed rings, each a list of [x, y].
export function glyphOutline(union, strokes, r, dx = 0) {
  const polys = [];
  for (const s of strokes) polys.push(...strokePolygons(s.map((v, i) => (i % 2 ? v : v + dx)), r));
  if (!polys.length) return [];
  const round = (p) => p.map((ring) => ring.map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10]));
  const merged = union(...polys.map(round));
  return merged.flat();
}

const bounds = (strokes) => {
  let x0 = Infinity, x1 = -Infinity;
  for (const s of strokes) for (let i = 0; i < s.length; i += 2) { x0 = Math.min(x0, s[i]); x1 = Math.max(x1, s[i]); }
  return isFinite(x0) ? [x0, x1] : [0, 0];
};

// Lay the drawings out as glyphs: every character's versions share one advance (each centred in it),
// letters and digits rotate through `slots` versions (repeating if fewer were drawn).
export function plan(drawings, { pen = 0.085 } = {}) {
  const penU = pen * XH;
  const chars = Object.keys(drawings).filter((c) => drawings[c] && drawings[c].some((v) => v && v.length));
  const slots = Math.max(1, ...chars.filter(cycles).map((c) => drawings[c].filter((v) => v && v.length).length));
  const glyphs = [];
  for (const ch of chars) {
    const vs = drawings[ch].filter((v) => v && v.length);
    const inks = vs.map((v) => { const [a, b] = bounds(v); return b - a + penU; });
    const shared = inks.reduce((a, b) => a + b, 0) / inks.length;
    const adv = Math.round(shared + 2 * SB);
    const n = cycles(ch) ? slots : 1;
    for (let i = 0; i < n; i++) {
      const k = i % vs.length;
      const [x0] = bounds(vs[k]);
      const lsb = SB + (shared - inks[k]) / 2 + penU / 2;   // where the ink's left edge's centreline sits
      glyphs.push({ ch, slot: i, name: i ? `${glyphName(ch)}.alt${i}` : glyphName(ch), strokes: vs[k], adv, dx: lsb - x0 });
    }
  }
  return { glyphs, slots, penU };
}

// Data for stavan.js (Hand): live preview, replay, SVG/PNG/video export of the drawn handwriting.
export function handData(drawings, opts = {}) {
  const { glyphs, slots, penU } = plan(drawings, opts);
  const meta = { upm: UPM, xh: XH, pen: Math.round(penU * 10) / 10, slots, asc: ASC, desc: DESC, cmap: {}, adv: {}, dx: {}, kern: {} };
  const strokes = {};
  for (let i = 0; i < slots; i++) meta.adv[i ? `space.alt${i}` : "space"] = Math.round(SPACE);
  for (const g of glyphs) {
    if (!g.slot) meta.cmap[g.ch] = g.name;
    meta.adv[g.name] = g.adv;
    meta.dx[g.name] = Math.round(g.dx * 10) / 10;
    strokes[g.name] = g.strokes.map((s) => s.map(Math.round));
  }
  return { meta, strokes };
}

// A real font file (OpenType/CFF) as an ArrayBuffer.
// libs: { opentype, union } (opentype.js and polygon-clipping's union). cache: optional Map reused between
// builds so unchanged glyphs are not merged again.
export function buildFont(libs, drawings, { family = "My Handwriting", pen = 0.085, designer = "", cache = null } = {}) {
  const { opentype, union } = libs;
  const { glyphs, slots, penU } = plan(drawings, { pen });
  const r = penU / 2;
  const outline = (strokes, dx) => {
    const key = cache && `${r}|${dx}|${JSON.stringify(strokes)}`;
    if (cache && cache.has(key)) return cache.get(key);
    const rings = glyphOutline(union, strokes, r, dx);
    if (cache) cache.set(key, rings);
    return rings;
  };
  const otGlyphs = [];
  const notdef = new opentype.Path();
  addRings(notdef, outline([[30, 0, 30, 640, 330, 640, 330, 0, 30, 0]], 0));
  otGlyphs.push(new opentype.Glyph({ name: ".notdef", unicode: undefined, advanceWidth: 360 + 2 * SB, path: notdef }));
  const spaces = [];
  for (let i = 0; i < slots; i++) {
    const g = new opentype.Glyph({ name: i ? `space.alt${i}` : "space", unicode: i ? undefined : 32, advanceWidth: Math.round(SPACE), path: new opentype.Path() });
    spaces.push(otGlyphs.length);
    otGlyphs.push(g);
  }
  const index = {};
  for (const g of glyphs) {
    const path = new opentype.Path();
    addRings(path, outline(g.strokes, Math.round(g.dx * 10) / 10));
    index[g.name] = otGlyphs.length;
    otGlyphs.push(new opentype.Glyph({
      name: g.name, unicode: g.slot ? undefined : g.ch.codePointAt(0), advanceWidth: g.adv, path,
    }));
  }
  const font = new opentype.Font({
    familyName: family, styleName: "Regular", unitsPerEm: UPM, ascender: ASC, descender: DESC,
    designer: designer || family, description: "Made with font.stavan.ai/make from hand-drawn strokes.",
    manufacturer: "font.stavan.ai", manufacturerURL: "https://font.stavan.ai/make", glyphs: otGlyphs,
  });
  if (slots > 1) font.tables.gsub = rotation(glyphs, slots, index, spaces);
  return font.toArrayBuffer();
}

function addRings(path, rings) {
  for (const ring of rings) {
    const pts = ring[0][0] === ring[ring.length - 1][0] && ring[0][1] === ring[ring.length - 1][1] ? ring.slice(0, -1) : ring;
    pts.forEach(([x, y], i) => (i ? path.lineTo(Math.round(x), Math.round(y)) : path.moveTo(Math.round(x), Math.round(y))));
    path.close();
  }
}

// calt: "sub @s{k} @s0' by @s{k+1}" as one chain-context lookup (one format-3 subtable per k)
// plus one single-substitution lookup per step. Spaces take part, so the rotation carries across words.
function rotation(glyphs, slots, index, spaces) {
  const slotIds = Array.from({ length: slots }, (_, k) => [spaces[k]]);
  const bySlot0 = [];
  for (const g of glyphs) {
    if (!cycles(g.ch)) continue;
    slotIds[g.slot].push(index[g.name]);
    if (g.slot === 0) bySlot0.push(g);
  }
  const cov = (ids) => ({ format: 1, glyphs: [...ids].sort((a, b) => a - b) });
  const s0 = cov(slotIds[0]).glyphs;
  const toSlot = (k) => s0.map((id) => {
    if (spaces.includes(id)) return spaces[k];
    const g = bySlot0.find((b) => index[b.name] === id);
    return index[k ? `${g.name}.alt${k}` : g.name];
  });
  const lookups = [{
    lookupType: 6, lookupFlag: 0,
    subtables: Array.from({ length: slots - 1 }, (_, k) => ({
      substFormat: 3, backtrackCoverage: [cov(slotIds[k])], inputCoverage: [cov(slotIds[0])], lookaheadCoverage: [],
      lookupRecords: [{ sequenceIndex: 0, lookupListIndex: k + 1 }],
    })),
  }];
  for (let k = 1; k < slots; k++) {
    lookups.push({ lookupType: 1, lookupFlag: 0, subtables: [{ substFormat: 2, coverage: { format: 1, glyphs: s0 }, substitute: toSlot(k) }] });
  }
  const langSys = { reserved: 0, reqFeatureIndex: 0xffff, featureIndexes: [0] };
  return {
    version: 1,
    scripts: [
      { tag: "DFLT", script: { defaultLangSys: langSys, langSysRecords: [] } },
      { tag: "latn", script: { defaultLangSys: langSys, langSysRecords: [] } },
    ],
    features: [{ tag: "calt", feature: { featureParams: 0, lookupListIndexes: [0] } }],
    lookups,
  };
}
