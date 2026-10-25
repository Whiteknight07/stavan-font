// print3d.js — text -> a 3D-printable STL: every pen stroke becomes a tube lying on a thin plaque,
// like a neon sign or a cake topper. Units are millimetres.
//
//   const blob = stlFromText(hand, "hello", { letterHeight: 12 });

export function stlFromText(hand, text, { letterHeight = 12, tube = 0.09, plate = 1.6, margin = 4, maxWidth = 180 } = {}) {
  const mm = letterHeight / (1.75 * hand.m.xh);          // capitals are about 1.75 x-heights tall
  const r = Math.max(0.6, tube * hand.m.xh * mm);        // tube radius, at least 0.6 mm so it prints
  const { strokes } = hand.penStrokes(text || " ", maxWidth / mm);
  // stroke points in mm, y up
  const lines = strokes.map((s) => simplify(s.pts.map(([x, y]) => [x * mm, -y * mm]), 0.15));
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const l of lines) for (const [x, y] of l) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  if (!isFinite(x0)) { x0 = y0 = 0; x1 = y1 = 10; }
  const tris = [];
  const z = plate + r * 0.6;                              // sink tubes a little into the plaque so they fuse
  for (const l of lines) tubeMesh(l.map(([x, y]) => [x - x0 + margin + r, y - y0 + margin + r, z]), r, tris);
  box(0, 0, 0, x1 - x0 + 2 * (margin + r), y1 - y0 + 2 * (margin + r), plate, tris);
  return toSTL(tris);
}

function simplify(pts, eps) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); const [ax, ay] = pts[a], [bx, by] = pts[b];
    const dx = bx - ax, dy = by - ay, n = Math.hypot(dx, dy) || 1;
    let best = -1, bi = -1;
    for (let i = a + 1; i < b; i++) { const d = Math.abs(dx * (pts[i][1] - ay) - dy * (pts[i][0] - ax)) / n; if (d > best) { best = d; bi = i; } }
    if (best > eps) { keep[bi] = 1; st.push([a, bi], [bi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const norm = (v) => { const n = Math.hypot(...v) || 1; return v.map((c) => c / n); };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];

// A closed tube: a ring of N vertices around each point, joined by quads, with domed ends.
function tubeMesh(pts, r, tris, N = 12) {
  if (pts.length === 1) pts = [pts[0], [pts[0][0] + 0.01, pts[0][1], pts[0][2]]];
  const up = [0, 0, 1];
  const dirs = pts.map((p, i) => norm(sub(pts[Math.min(i + 1, pts.length - 1)], pts[Math.max(i - 1, 0)])));
  const ring = (c, d, rad) => {
    const u = norm(cross(d, up)), v = cross(u, d);
    return Array.from({ length: N }, (_, k) => {
      const a = (2 * Math.PI * k) / N;
      return [c[0] + rad * (Math.cos(a) * u[0] + Math.sin(a) * v[0]), c[1] + rad * (Math.cos(a) * u[1] + Math.sin(a) * v[1]), c[2] + rad * (Math.cos(a) * u[2] + Math.sin(a) * v[2])];
    });
  };
  const rings = pts.map((p, i) => ring(p, dirs[i], r));
  const quad = (a, b, c, d) => { tris.push([a, b, c], [a, c, d]); };
  for (let i = 1; i < rings.length; i++)
    for (let k = 0; k < N; k++) quad(rings[i - 1][k], rings[i - 1][(k + 1) % N], rings[i][(k + 1) % N], rings[i][k]);
  // domed caps: two shrinking rings and a tip at each end
  const cap = (i, sign) => {
    const d = dirs[i].map((c) => c * sign), c = pts[i];
    let prev = rings[i];
    for (const [t, s] of [[0.5, 0.87], [0.85, 0.5]]) {
      const cc = [c[0] + d[0] * r * t, c[1] + d[1] * r * t, c[2] + d[2] * r * t];
      const next = ring(cc, dirs[i], r * s);
      for (let k = 0; k < N; k++) sign > 0 ? quad(prev[k], prev[(k + 1) % N], next[(k + 1) % N], next[k]) : quad(prev[k], next[k], next[(k + 1) % N], prev[(k + 1) % N]);
      prev = next;
    }
    const tip = [c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r];
    for (let k = 0; k < N; k++) sign > 0 ? tris.push([prev[k], prev[(k + 1) % N], tip]) : tris.push([prev[(k + 1) % N], prev[k], tip]);
  };
  cap(rings.length - 1, 1);
  cap(0, -1);
}

function box(x0, y0, z0, x1, y1, z1, tris) {
  const p = (x, y, z) => [x, y, z];
  const v = [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0), p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)];
  const f = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];
  for (const [a, b, c] of f) tris.push([v[a], v[b], v[c]]);
}

function toSTL(tris) {
  const buf = new ArrayBuffer(84 + tris.length * 50);
  const dv = new DataView(buf);
  const head = "Stavan handwriting, font.stavan.ai";
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, tris.length, true);
  let o = 84;
  for (const [a, b, c] of tris) {
    const n = norm(cross(sub(b, a), sub(c, a)));
    for (const v of [n, a, b, c]) for (const comp of v) { dv.setFloat32(o, comp, true); o += 4; }
    o += 2;
  }
  return new Blob([buf], { type: "model/stl" });
}
