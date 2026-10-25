"""Shape test sentences with HarfBuzz (the real font) -> test/golden.json.

test/layout.test.mjs checks that site/stavan.js lays text out exactly like this,
so the pen replay always lands where the font puts each letter.
"""
import json
import os

import uharfbuzz as hb

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
TESTS = [
    "The quick brown fox jumps over the lazy dog.",
    "aaaaaaaaaaaa the the the",
    "Hello, World! (x+y)^2 = 42; café über naïve",
    "AVATAR To Ty Wa yo fo kj",
    "e.g. 3.14159 — “quotes” ‘single’ … done",
    "Zt is just a linear combination of two Random variables",
    "Sphinx of black quartz, judge my vow. #1 @home 50% $5 & {ok} [x] <y> a_b \\ |",
]


def main():
    out = {"tests": TESTS}
    for w in ("Regular", "Bold"):
        font = hb.Font(hb.Face(hb.Blob.from_file_path(os.path.join(ROOT, "dist", f"Stavan-{w}.ttf"))))
        res = []
        for t in TESTS:
            buf = hb.Buffer()
            buf.add_str(t)
            buf.guess_segment_properties()
            hb.shape(font, buf, {"calt": True, "kern": True})
            x, row = 0, []
            for i, p in zip(buf.glyph_infos, buf.glyph_positions):
                row.append([font.glyph_to_string(i.codepoint), x])
                x += p.x_advance
            res.append(row)
        out[w] = res
    json.dump(out, open(os.path.join(ROOT, "test", "golden.json"), "w"), ensure_ascii=False, indent=0)


if __name__ == "__main__":
    main()
