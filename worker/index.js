// font.stavan.ai: serves the playground, plus /write.svg, which writes any text by hand as an image.
//
//   https://font.stavan.ai/write.svg?text=hello%20there&color=007aff&size=64
//
// Parameters: text, size (px, 8-300), color (hex without #, or a CSS colour name), weight (regular|bold),
// width (px, wraps at spaces), bg (background colour), speed (x-heights per second), static (1 = no animation),
// tight (0 = keep full line height instead of cropping to the ink), start (0-4: which of the five versions the
// first letter of each run uses; the rest follow on from it, so "Hi" with start=4 gets a different H and i).
import { Hand } from "../site/stavan.js";
import strokes from "../site/data/strokes.json";
import regular from "../site/data/stavan-Regular.json";
import bold from "../site/data/stavan-Bold.json";

const hands = { regular: new Hand(regular, strokes, "Regular"), bold: new Hand(bold, strokes, "Bold") };
const num = (v) => (v === null || v === "" ? NaN : Number(v));
const clamp = (v, lo, hi, d) => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
const colour = (v, d) => {
  if (!v) return d;
  if (/^[0-9a-f]{3}([0-9a-f]{3}([0-9a-f]{2})?)?$/i.test(v)) return "#" + v;
  if (/^#[0-9a-f]{3}([0-9a-f]{3}([0-9a-f]{2})?)?$/i.test(v)) return v;
  if (/^[a-z]{3,24}$/i.test(v)) return v.toLowerCase();
  return d;
};

// The font's rotation, begun at version `start` instead of the first: shape as if `start` spaces came first
// (spaces take part in the rotation), then drop them.
function startingAt(hand, start) {
  if (!start) return hand;
  const h = Object.create(hand);
  h.shape = (text) => {
    const { glyphs, width } = hand.shape(" ".repeat(start) + text);
    const dx = glyphs.length > start ? glyphs[start].x : width;
    return { glyphs: glyphs.slice(start).map((g) => ({ ...g, x: g.x - dx })), width: width - dx };
  };
  return h;
}

function write(url) {
  const q = url.searchParams;
  const text = (q.get("text") ?? "hello").slice(0, 1000) || " ";
  const base = hands[q.get("weight")?.toLowerCase() === "bold" ? "bold" : "regular"];
  const hand = startingAt(base, Math.round(clamp(num(q.get("start")), 0, base.m.slots - 1, 0)));
  const svg = hand.svg(text, {
    size: clamp(num(q.get("size")), 8, 300, 64),
    color: colour(q.get("color"), "#000000"),
    background: colour(q.get("bg"), null),
    maxWidth: q.has("width") ? clamp(num(q.get("width")), 50, 4000, undefined) : undefined,
    speed: clamp(num(q.get("speed")), 1, 100, 13),
    animate: !["1", "true", "yes"].includes(q.get("static")),
    tight: q.get("tight") !== "0",
  });
  return new Response(svg, {
    headers: {
      "content-type": "image/svg+xml; charset=utf-8",
      "cache-control": "public, max-age=604800, immutable",
      "access-control-allow-origin": "*",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/write.svg" || url.pathname === "/write") return write(url);
    return env.ASSETS.fetch(request);
  },
};
