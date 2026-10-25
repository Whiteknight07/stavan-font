<p align="center">
  <a href="https://font.stavan.ai"><img src="assets/hero.svg" alt="Hi, this is Stavan. My real handwriting, as a font." width="760"></a>
</p>

<p align="center">
  <b>A free handwriting font made from 675 pages of my real Apple Pencil notes.</b><br>
  Every letter has five versions from different pages, they take turns as you type, and it can write itself.
</p>

<p align="center">
  <a href="https://font.stavan.ai"><b>Try it at font.stavan.ai</b></a> &nbsp;|&nbsp;
  <a href="https://github.com/Whiteknight07/stavan-font/releases/latest"><b>Download</b></a> &nbsp;|&nbsp;
  <a href="#handwriting-in-any-readme-with-a-url">Handwriting by URL</a> &nbsp;|&nbsp;
  <a href="https://font.stavan.ai/make"><b>Make your own</b></a> &nbsp;|&nbsp;
  <a href="https://font.stavan.ai/how">How it was made</a> &nbsp;|&nbsp;
  <a href="#stavan-mono-code-in-my-handwriting">Stavan Mono</a>
</p>

<p align="center">
  <a href="https://github.com/Whiteknight07/stavan-font/releases/latest"><img alt="Release" src="https://img.shields.io/github/v/release/Whiteknight07/stavan-font?color=000"></a>
  <a href="OFL.txt"><img alt="Font license: OFL 1.1" src="https://img.shields.io/badge/font-OFL_1.1-000"></a>
  <a href="LICENSE"><img alt="Code license: MIT" src="https://img.shields.io/badge/code-MIT-000"></a>
  <a href="https://github.com/Whiteknight07/stavan-font/actions/workflows/ci.yml"><img alt="CI" src="https://github.com/Whiteknight07/stavan-font/actions/workflows/ci.yml/badge.svg"></a>
</p>

![A line from my notes above the same line typed in Stavan](dist/notes-vs-font.png)

Top: a line from my notes. Bottom: the same line typed in the font.

## What makes it different

- **Real strokes, not a template.** Most handwriting fonts come from writing the alphabet into boxes. This one was cut out of
  my everyday lecture notes, written fast and slow, so it keeps how I actually write. GoodNotes stores Apple Pencil ink as
  vector paths, so every letter is the exact path my pen took. Nothing was traced from photos or redrawn.
- **Five versions of every letter and digit.** They rotate as you type (OpenType `calt`), and the rotation carries across
  spaces, so the same word never comes out the same twice.
- **It can write itself.** The pen paths are kept in the order I drew them, so any text can be replayed stroke by stroke:
  live as you type on [font.stavan.ai](https://font.stavan.ai), as an animated SVG, as a video, or from a URL.
- **Three fonts.** Stavan (Regular and Bold), Stavan Mono for code, and a single-line version for pen plotters.

## The playground

[font.stavan.ai](https://font.stavan.ai) is a notebook page you can write on:

- **Live ink.** The pen draws each letter as you type it.
- **Watch it write.** Replays the whole page with the real pen strokes, in the order I wrote them.
- **Send as a note.** Copies a link. Whoever opens it watches your note being written.
- **Save** an image, a video of it writing (MP4), an animated SVG, **notebook pages** (a PDF of ruled pages with the
  ink stored as pen strokes, ready to import into GoodNotes) or a **3D print** (an STL where every stroke is a tube).
- **Neon sign.** Switch the paper to neon and the page becomes a brick wall with your words in glowing tubes.
- **Where each letter came from.** Pick a character to see its five versions inside the real words they were cut from.
- **Real or font?** A game. One word was written in my notes, the other was typed in the font. Pick the real one.
- My six real GoodNotes ink colours, ruled, grid, dotted or blank paper, and a bookmarklet that turns any website into
  my handwriting.

## Make a font of your own handwriting

[font.stavan.ai/make](https://font.stavan.ai/make) lets anyone draw their alphabet with an Apple Pencil, a finger or a
mouse and download it as a real font (OpenType), with the same rotating versions as Stavan if you draw letters more
than once. You can type with it the moment you've drawn a few letters. Everything runs in the browser: the strokes
are merged into outlines with a polygon union and written to a font file with opentype.js. Nothing is uploaded.

## How it was made, as a story

[font.stavan.ai/how](https://font.stavan.ai/how) takes one real page of my notes apart as you scroll: the page writes
itself, then splits into its 496 strokes, its words, its letters, and finally the five letters that made it into the font.

## Install it on your computer

Download the `.ttf` files from the [latest release](https://github.com/Whiteknight07/stavan-font/releases/latest)
(or from [`dist/`](dist)), double-click each one and choose Install.

The letter rotation turns on by itself in Pages, Keynote, TextEdit, Figma, Photoshop, Illustrator, InDesign and every
browser. **In Microsoft Word**, turn on Format › Font › Advanced › "Use Contextual Alternates" once. Google Docs can't use
installed fonts, so use the web version there.

## Use it on a website

```html
<link rel="stylesheet" href="https://font.stavan.ai/dist/stavan.css">

<p class="stavan">Hello in my handwriting</p>
<pre class="stavan-mono">print("and in code")</pre>
```

Or use your own CSS: `font-family: "Stavan", cursive;` (weights 400 and 700) or `font-family: "Stavan Mono", monospace;`.
The same files are on jsDelivr (`https://cdn.jsdelivr.net/gh/Whiteknight07/stavan-font@1/dist/stavan.css`), or copy
`dist/*.woff2` and `dist/stavan.css` into your project.

## Handwriting in any README, with a URL

Put any text in the link and you get it written by hand, as an animated image:

```md
![hello](https://font.stavan.ai/write.svg?text=hello%20there&color=007aff)
```

![hello there](https://font.stavan.ai/write.svg?text=hello%20there&color=007aff)

| Parameter | Default | |
| --- | --- | --- |
| `text` | `hello` | What to write. Use `%0A` for a new line. |
| `size` | `64` | Pixels per em (8 to 300) |
| `color` | `000000` | Ink colour: hex without `#`, or a name like `red` |
| `weight` | `regular` | `regular` or `bold` |
| `width` | none | Wrap lines at this many pixels |
| `bg` | none | Background colour |
| `speed` | `13` | Pen speed, in x-heights per second |
| `static` | `0` | `1` for a still image |
| `start` | `0` | Which of the five versions to start on (`0` to `4`). Try it if you'd like a different-looking letter |

## Animated handwriting from code

```js
import { load } from "https://font.stavan.ai/stavan.js";

const hand = await load("https://font.stavan.ai/data/");
document.body.insertAdjacentHTML("beforeend", hand.svg("hello there", { size: 64, animate: true, color: "#007aff" }));
```

`hand.svg(text, options)` takes `size` (px per em), `color`, `maxWidth` (px), `animate`, `speed`, `background` and `tight`
(crop to the ink). `hand.draw(ctx, text, options)` draws onto a canvas, and `hand.drawAt(ctx, strokes, timing, t)` draws a
replay frame at time `t`.

From the command line (Node 18+):

```sh
node site/write.mjs "Hi, this is Stavan." --size 60 --color "#007aff" > hello.svg
node site/write.mjs "thick and still" --weight Bold --static > still.svg
```

## Stavan Mono: code in my handwriting

The same handwriting, squeezed into equal-width cells so code lines up. The five versions still take turns.
Download `StavanMono-Regular.ttf`, then in VS Code set:

```json
"editor.fontFamily": "Stavan Mono",
"editor.fontLigatures": true
```

The second line switches the letter rotation on (VS Code turns `calt` off unless ligatures are enabled).

## Write it with a real pen

The letters are pen paths, not outlines, so a pen plotter (AxiDraw, iDraw) or a laser can write them with a single line,
the way I did. [`dist/Stavan-SingleLine.svg`](dist/Stavan-SingleLine.svg) is a single-line SVG font: in Inkscape, open
Extensions › Text › Hershey Text and choose "Other SVG font". Animated SVGs from the playground or `/write.svg?static=1`
are single-line too and plot as they are.

## How it was made

The pipeline lives in [`hand/`](hand). It takes GoodNotes PDF exports and ends with the fonts and the site's data.

| Step | Script | What it does |
| --- | --- | --- |
| 1 | `extract.py` | Pulls every Apple Pencil stroke out of the PDFs as exact pen paths (286,273 strokes from 675 pages) |
| 2 | `segment.py`, `make_sheets.py` | Groups strokes into words and letters, then draws numbered contact sheets |
| 3 | (subagents) | GPT 6.1 Sol read 6,240 words off the contact sheets |
| 4 | `harvest.py` | Matches each transcription to its strokes (DP alignment), fits baseline and x-height per word, re-attaches i/j dots |
| 5 | `retrieve.py` | Finds rare characters (crossed Z, J, Q, ?) by shape among unlabelled strokes, then has them verified in context |
| 6 | `select_variants.py`, `qa.py` | Ranks samples by how typical they are, reviews 16 candidates per character, keeps 5 varied approved ones |
| 7 | `design.py`, `construct.py` | Light-touch sizing that keeps each letter's own size and bounce; builds accents and missing symbols from my own strokes |
| 8 | `build_font.py` | Round GoodNotes-style pen, then potrace, then TrueType; the 5-slot rotation, kerning, Mono, single-line SVG and web data |
| 9 | `export_words.py`, `export_page.py` | Export the source words for "where each letter came from" and "real or font?", and the page for the story |

All five versions of a character share one advance width, each centred in it. Browsers restart the rotation differently
when a line wraps, so equal widths keep line breaks and the cursor in the same place whichever version an app shows.

Some characters never appear in the notes. These were built from pieces of my own strokes: `! ^ \ # % $ @ & { }` and the
backtick, `…`, curly quotes, dashes and the accents.

### Build it yourself

```sh
uv venv && uv pip install -r requirements.txt   # or: pip install -r requirements.txt
brew install potrace                             # or: apt install potrace
cd hand && ../.venv/bin/python build_font.py     # design/ -> dist/ fonts + site/data/
python golden.py && node ../test/layout.test.mjs # check the site's layout against HarfBuzz
cd .. && npm run dev                             # the site + /write.svg locally (Cloudflare Workers)
```

The source notes (`data/`) and intermediate files (`work/`) are private and not in this repo, so steps 1 to 7 need your
own notes. `build_font.py` rebuilds everything from `design/` alone. To drop a bad version of a letter, add
`[char, word_id, group]` to `design/reject.json` (the ids are in `design/glyphs.json` under `src`), then rerun steps 6 to 8.

Want a font from your own notes? Fork this repo, export your GoodNotes notebooks as PDF into `data/`, and run the steps in order.

## License

The fonts are free for personal and commercial use under the [SIL Open Font License 1.1](OFL.txt). You can use them,
embed them and bundle them, but not sell the font files on their own. The code is [MIT](LICENSE).

Inspired by [harshpreet931/harshpreet-hand](https://github.com/harshpreet931/harshpreet-hand) (MIT); `build_font.py` is adapted from it.
Made by [Stavan](https://stavan.ai).
