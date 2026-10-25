// notebook.js — text -> a multi-page PDF of handwritten notebook pages. The ink is vector pen strokes
// (round caps, like GoodNotes stores Apple Pencil ink), so it stays sharp and imports into any notes app.
//
//   const blob = await notebookPDF(hand, "my notes...", { ink: "#000000", paper: "ruled" });

const PAGE = { A4: [595.28, 841.89], Letter: [612, 792] };

const hex = (c) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(c || "") || [0, "000000"];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => (v / 255).toFixed(3)).join(" ");
};
const f = (v) => (Math.round(v * 100) / 100).toString();

export async function notebookPDF(hand, text, { ink = "#000000", paper = "ruled", size = 22, format = "A4", margin = 54, title = "Notes" } = {}) {
  const [PW, PH] = PAGE[format] || PAGE.A4;
  const L = size * 1.7, scale = size / hand.m.upm;
  const top = margin + 12, left = margin;
  const width = PW - 2 * margin;
  const perPage = Math.max(1, Math.floor((PH - top - margin) / L));
  const { strokes, layout } = hand.penStrokes(text || " ", width / scale);
  const pages = Math.max(1, Math.ceil(layout.lines.length / perPage));
  const base0 = (hand.lineHeight - (hand.m.asc - hand.m.desc)) / 2 + hand.m.asc; // baseline inside a line box (font units)

  const streams = [];
  for (let p = 0; p < pages; p++) {
    let s = "";
    // paper
    const firstBase = top + base0 * scale;               // baseline of the first line on the page, from the top
    if (paper === "ruled" || paper === "grid") {
      const step = paper === "grid" ? L / 2 : L;
      s += `0.773 0.827 0.910 RG 0.6 w\n`;
      for (let y = firstBase % step; y < PH; y += step) s += `0 ${f(PH - y)} m ${f(PW)} ${f(PH - y)} l S\n`;
      if (paper === "grid") for (let x = left % step; x < PW; x += step) s += `${f(x)} 0 m ${f(x)} ${f(PH)} l S\n`;
    } else if (paper === "dots") {
      const step = L / 2;
      s += `0.706 0.757 0.831 RG 1.6 w 1 J\n`;
      for (let y = firstBase % step; y < PH; y += step)
        for (let x = left % step; x < PW; x += step) s += `${f(x)} ${f(PH - y)} m ${f(x)} ${f(PH - y)} l S\n`;
    }
    // ink
    s += `${hex(ink)} RG ${f(hand.m.pen * scale)} w 1 J 1 j\n`;
    for (const st of strokes) {
      if (st.line < p * perPage || st.line >= (p + 1) * perPage) continue;
      const dy = -p * perPage * hand.lineHeight;                            // move this page's lines to its top
      st.pts.forEach(([x, y], i) => {
        s += `${f(left + x * scale)} ${f(PH - (top + (y + dy) * scale))} ${i ? "l" : "m"}\n`;
      });
      if (st.pts.length === 1) s += `${f(left + st.pts[0][0] * scale + 0.01)} ${f(PH - (top + (st.pts[0][1] + dy) * scale))} l\n`;
      s += "S\n";
    }
    streams.push(s);
  }

  // assemble: catalog, pages, one page + content stream per page, info
  const enc = new TextEncoder();
  const parts = [];
  const offsets = [];
  let length = 0;
  const push = (data) => { const b = typeof data === "string" ? enc.encode(data) : data; parts.push(b); length += b.length; };
  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  const obj = (n, body) => { offsets[n] = length; push(`${n} 0 obj\n`); push(body); push("\nendobj\n"); };
  const kids = [];
  for (let p = 0; p < pages; p++) kids.push(`${3 + 2 * p} 0 R`);
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Count ${pages} /Kids [${kids.join(" ")}] >>`);
  for (let p = 0; p < pages; p++) {
    const pageN = 3 + 2 * p, contentN = pageN + 1;
    obj(pageN, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${f(PW)} ${f(PH)}] /Contents ${contentN} 0 R /Resources << >> >>`);
    const raw = enc.encode(streams[p]);
    const z = await deflate(raw);
    const body = z
      ? [enc.encode(`<< /Length ${z.length} /Filter /FlateDecode >>\nstream\n`), z, enc.encode("\nendstream")]
      : [enc.encode(`<< /Length ${raw.length} >>\nstream\n`), raw, enc.encode("\nendstream")];
    offsets[contentN] = length;
    push(`${contentN} 0 obj\n`); body.forEach(push); push("\nendobj\n");
  }
  const infoN = 3 + 2 * pages;
  const esc = (t) => String(t).replace(/[\\()]/g, "\\$&").replace(/[^\x20-\x7e]/g, "");
  obj(infoN, `<< /Title (${esc(title)}) /Creator (font.stavan.ai) /Producer (Stavan notebook) >>`);
  const xref = length;
  let x = `xref\n0 ${infoN + 1}\n0000000000 65535 f \n`;
  for (let n = 1; n <= infoN; n++) x += `${String(offsets[n]).padStart(10, "0")} 00000 n \n`;
  push(x);
  push(`trailer\n<< /Size ${infoN + 1} /Root 1 0 R /Info ${infoN} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: "application/pdf" });
}

async function deflate(bytes) {
  if (typeof CompressionStream === "undefined") return null;
  try {
    const cs = new CompressionStream("deflate");
    const out = new Blob([bytes]).stream().pipeThrough(cs);
    return new Uint8Array(await new Response(out).arrayBuffer());
  } catch { return null; }
}
