#!/usr/bin/env node
// Write text as a handwriting SVG from the command line.
//
//   node site/write.mjs "hello there" > hello.svg
//   node site/write.mjs "hello" --size 72 --color "#007aff" --weight Bold --width 600 --static --background "#fff"
//
// Animated by default: the strokes draw themselves in the order they were written.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { Hand } from "./stavan.js";

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = (name) => {
  const i = args.indexOf(`--${name}`);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};

const size = +opt("size", 64);
const color = opt("color", "#000000");
const weight = opt("weight", "Regular");
const width = opt("width");
const background = opt("background");
const speed = opt("speed");
const still = flag("static");
const text = args.join(" ").replace(/\\n/g, "\n");
if (!text) {
  console.error('usage: node write.mjs "text" [--size 64] [--color #000] [--weight Regular|Bold] [--width px] [--background #fff] [--speed 13] [--static]');
  process.exit(1);
}

const data = join(dirname(fileURLToPath(import.meta.url)), "data");
const hand = new Hand(
  JSON.parse(readFileSync(join(data, `stavan-${weight}.json`), "utf8")),
  JSON.parse(readFileSync(join(data, "strokes.json"), "utf8")),
  weight,
);
process.stdout.write(hand.svg(text, {
  size, color, background, animate: !still,
  maxWidth: width ? +width : undefined,
  speed: speed ? +speed : undefined,
}) + "\n");
