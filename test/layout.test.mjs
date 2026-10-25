// Checks that site/stavan.js shapes text exactly like HarfBuzz does with the real font files
// (glyph choice from the calt rotation + kerning). Golden data: hand/golden.py -> test/golden.json.
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
import { Hand } from "../site/stavan.js";

const golden = JSON.parse(readFileSync(new URL("./golden.json", import.meta.url)));
const strokes = JSON.parse(readFileSync(new URL("../site/data/strokes.json", import.meta.url)));
let n = 0;
for (const w of ["Regular", "Bold"]) {
  const hand = new Hand(JSON.parse(readFileSync(new URL(`../site/data/stavan-${w}.json`, import.meta.url))), strokes, w);
  golden.tests.forEach((t, i) => {
    const got = hand.shape(t).glyphs.map((g) => [g.name, Math.round(g.x)]);
    assert.deepEqual(got, golden[w][i], `${w}: "${t}"`);
    n++;
  });
  // every glyph the layout can pick has pen strokes and metrics
  for (const name of Object.keys(hand.m.adv)) {
    if (!name.startsWith("space")) assert.ok(strokes[name], `${name} has strokes`);
  }
  // the animated SVG is well formed
  const svg = hand.svg("Hello <world> & \"friends\"", { animate: true });
  assert.match(svg, /^<svg [^>]+>.*<\/svg>$/s);
  assert.ok(!svg.includes("<world>"));
}
console.log(`ok - ${n} layouts match HarfBuzz`);
