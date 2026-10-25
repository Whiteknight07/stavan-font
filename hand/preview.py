"""Render text in the built font with HarfBuzz shaping (so calt rotation and kerning apply)."""
import sys
import freetype
import numpy as np
import uharfbuzz as hb
from PIL import Image


def render_lines(font_path, lines, px=64, width=1800, ink=(25, 35, 120), bg=(250, 248, 240), lh=1.75):
    blob = hb.Blob.from_file_path(font_path)
    face = hb.Face(blob)
    font = hb.Font(face)
    upem = face.upem
    ft = freetype.Face(font_path)
    ft.set_pixel_sizes(0, px)
    H = int(len(lines) * px * lh + px)
    img = np.full((H, width, 3), bg, np.uint8)
    for li, text in enumerate(lines):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(font, buf, {"kern": True, "calt": True})
        x = px * 0.5
        base = int(px * 1.1 + li * px * lh)
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            ft.load_glyph(info.codepoint, freetype.FT_LOAD_RENDER | freetype.FT_LOAD_NO_HINTING)
            g = ft.glyph
            bm = g.bitmap
            if bm.width and bm.rows:
                a = np.array(bm.buffer, np.uint8).reshape(bm.rows, bm.pitch)[:, :bm.width] / 255.0
                gx = int(round(x + pos.x_offset * px / upem)) + g.bitmap_left
                gy = base - g.bitmap_top
                y0, x0 = max(gy, 0), max(gx, 0)
                y1, x1 = min(gy + bm.rows, H), min(gx + bm.width, width)
                if y1 > y0 and x1 > x0:
                    sub = a[y0 - gy:y1 - gy, x0 - gx:x1 - gx][..., None]
                    reg = img[y0:y1, x0:x1].astype(float)
                    img[y0:y1, x0:x1] = (reg * (1 - sub) + np.array(ink) * sub).astype(np.uint8)
            x += pos.x_advance * px / upem
    return Image.fromarray(img)


if __name__ == "__main__":
    font, out = sys.argv[1], sys.argv[2]
    lines = sys.argv[3:] or [
        "The quick brown fox jumps over the lazy dog.",
        "Sphinx of black quartz, judge my vow!",
        "the the the  apple  moon  letter  hello",
        "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
        "abcdefghijklmnopqrstuvwxyz  0123456789",
        "Var[Z] = E[(X - mu)^2] + 0.25 * (n + 1)",
    ]
    render_lines(font, lines).save(out)
