// The browser-side builders: font maker (draw your own), notebook PDF and 3D print.
// Needs: npm install --no-save opentype.js@1.3.4 polygon-clipping@0.15.7
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import opentype from "opentype.js";
import clip from "polygon-clipping";
import { Hand } from "../site/stavan.js";
import { buildFont, handData } from "../site/make/fontmaker.js";
import { notebookPDF } from "../site/notebook.js";
import { stlFromText } from "../site/print3d.js";

const json = (p) => JSON.parse(readFileSync(new URL(p, import.meta.url)));
const strokes = json("../site/data/strokes.json");
const meta = json("../site/data/stavan-Regular.json");
const hand = new Hand(meta, strokes, "Regular");

// font maker: draw "a b c" (a and b with three versions each) from Stavan's own strokes
const drawings = {};
for (const ch of "abc!") {
  const base = meta.cmap[ch];
  drawings[ch] = (ch === "a" || ch === "b" ? [base, `${base}.alt1`, `${base}.alt2`] : [base]).map((n) => strokes[n]);
}
const buf = buildFont({ opentype, union: clip.union }, drawings, { family: "Test Hand" });
const font = opentype.parse(buf);
assert.equal(font.names.fontFamily.en, "Test Hand");
assert.ok(font.charToGlyph("a").path.commands.length > 10, "a has an outline");
assert.equal(font.charToGlyph("a").advanceWidth, font.glyphs.get(font.charToGlyph("a").index + 1).advanceWidth, "versions share an advance");
assert.equal(font.tables.gsub.features[0].tag, "calt");
const hd = handData(drawings);
assert.equal(hd.meta.slots, 3);
const mine = new Hand(hd.meta, hd.strokes, "Mine");
assert.deepEqual(mine.shape("aaaa").glyphs.map((g) => g.name), ["uni0061", "uni0061.alt1", "uni0061.alt2", "uni0061"]);

// notebook PDF: several pages, well-formed trailer
const pdf = new Uint8Array(await (await notebookPDF(hand, "notes ".repeat(600), { paper: "grid" })).arrayBuffer());
const text = new TextDecoder("latin1").decode(pdf);
assert.ok(text.startsWith("%PDF-1.4"));
assert.ok(text.trimEnd().endsWith("%%EOF"));
assert.ok(+/\/Count (\d+)/.exec(text)[1] >= 2, "long text spans pages");

// STL: binary layout matches the triangle count
const stl = new DataView(await stlFromText(hand, "hi").arrayBuffer());
assert.equal(stl.byteLength, 84 + 50 * stl.getUint32(80, true));

console.log("ok - font maker, notebook PDF and STL");
