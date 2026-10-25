# Changelog

## 1.1.0 (2026-10-25)

- New home: https://font.stavan.ai (Cloudflare). Old github.io links redirect there.
- `/write.svg?text=...`: any text written by hand as an animated image, for READMEs and websites
- Stavan Mono: the handwriting in equal-width cells, for code
- Stavan Single Line: an SVG font of pen centrelines for pen plotters, lasers and Inkscape Hershey Text
- Playground: live ink (the pen draws each letter as you type), "Send as a note" links that write
  themselves out for the reader, and video export (MP4)
- All five versions of a character now share one advance width, so line breaks and the cursor land in the same
  place in every app and browser
- Line wrapping in `stavan.js` matches browsers (hyphens, dashes, long words)

## 1.0.0 (2026-10-25)

- Stavan Regular and Bold: 150 characters, 705 hand-picked variants from 675 pages of notes
- 5-slot letter rotation (`calt`) that carries across spaces, and kerning from ink profiles
- Playground with live pen replay, image and animated SVG export,
  shareable links, "where each letter came from" and a "real or font?" game
- `stavan.js` library and `write.mjs` command-line tool for animated handwriting SVGs
- Bookmarklet that switches any website to Stavan
