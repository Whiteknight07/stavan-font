"""Build the handwriting font (TTF/WOFF/WOFF2) from design/glyphs.json.

pen centrelines --(round nib)--> bitmap @ 1px/unit --(potrace)--> cubic
outlines --(cu2qu)--> TrueType, plus calt variant cycling and kerning.
Adapted from harshpreet-hand/pipeline/build_font.py (MIT).
"""
import json
import os
import re
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

import numpy as np
from PIL import Image
from fontTools.agl import UV2AGL
from fontTools.feaLib.builder import addOpenTypeFeaturesFromString
from fontTools.fontBuilder import FontBuilder
from fontTools.pens.areaPen import AreaPen
from fontTools.pens.cu2quPen import Cu2QuPen
from fontTools.pens.recordingPen import RecordingPen, DecomposingRecordingPen
from fontTools.pens.reverseContourPen import ReverseContourPen
from fontTools.pens.transformPen import TransformPen
from fontTools.pens.ttGlyphPen import TTGlyphPen
from fontTools.svgLib.path import parse_path

from strokes import render

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.join(HERE, "..")
DESIGN = os.path.join(ROOT, "design")
DIST = os.path.join(ROOT, "dist")

FAMILY = "Stavan"
PS_FAMILY = "Stavan"
VERSION = "1.100"
OFL = ("This Font Software is licensed under the SIL Open Font License, Version 1.1. "
       "This license is available with a FAQ at: https://openfontlicense.org")
UPM = 1000
S = 440                 # font units per x-height (design unit)
SB = 0.13 * S           # ink-to-ink half gap (measured in the notes: 0.26 xh between letters)
SPACE = 0.78 * S
NSLOT = 5                # every letter/digit gets 5 rotating slots (real variants, repeated if fewer)
# All five versions of a character share one advance width (each is centred in it), so text takes the
# same space whichever version an app picks. Browsers restart the rotation differently at line wraps;
# equal widths keep line breaks and caret positions identical everywhere.
SLOT_SPACE = [1.0] * NSLOT
TIGHT = set(".,:;'’‘\"“”!")   # glyphs that want smaller side bearings
WEIGHTS = {"Regular": dict(pen=0.085, wclass=400), "Bold": dict(pen=0.15, wclass=700)}   # Regular = the GoodNotes pen
MONO_CELL = 620          # Stavan Mono: every glyph gets this advance; wide letters are squeezed to fit
MONO_MARGIN = 0.05 * S


def mono_fit(paths, pen_u):
    """Squeeze a glyph horizontally (only if needed) and centre it in a fixed-width cell.

    Returns (paths, lsb, rsb) with ink width + lsb + rsb == MONO_CELL.
    """
    P = [np.asarray(p, float) for p in paths]
    a = np.vstack(P)
    x0, x1 = a[:, 0].min(), a[:, 0].max()
    ink_c = (x1 - x0) * S
    avail = MONO_CELL - pen_u - 2 * MONO_MARGIN
    sx = min(1.0, avail / ink_c) if ink_c > 0 else 1.0
    P = [np.c_[(p[:, 0] - x0) * sx, p[:, 1]] for p in P]
    ink_c *= sx
    lsb = (MONO_CELL - ink_c) / 2
    rsb = MONO_CELL - (ink_c + pen_u) - lsb
    return P, lsb, rsb


def glyph_name(ch):
    cp = ord(ch)
    n = UV2AGL.get(cp)
    return n if n else f"uni{cp:04X}"


def trace(paths, pen_u):
    """paths (font units, y up) -> RecordingPen of outlines in bitmap-local coords.

    Returns (recording, x0, y1, margin, H) so callers can place it.
    """
    a = np.vstack(paths)
    x0, x1, y0, y1 = a[:, 0].min(), a[:, 0].max(), a[:, 1].min(), a[:, 1].max()
    m = int(pen_u) + 6
    W = int(np.ceil(x1 - x0)) + 2 * m
    H = int(np.ceil(y1 - y0)) + 2 * m
    pix = [np.c_[p[:, 0] - x0 + m, (y1 + m) - p[:, 1]] for p in paths]
    bm = render(pix, (H, W), radius=pen_u / 2)[:H, :W]
    with tempfile.TemporaryDirectory() as td:
        pbm = os.path.join(td, "g.pbm")
        svg = os.path.join(td, "g.svg")
        Image.fromarray(((1 - bm) * 255).astype(np.uint8)).convert("1").save(pbm)
        subprocess.run(["potrace", pbm, "-s", "-o", svg, "-u", "1", "--flat", "-a", "1.2", "-O", "1.0", "-t", "4"],
                       check=True)
        txt = open(svg).read()
    rec = RecordingPen()
    for d in re.findall(r'<path d="([^"]+)"', txt, re.S):
        parse_path(d, rec)
    return rec, x0, y1, m, H, bm


class Glyph:
    def __init__(self, name, ch, paths, pen_u, lsb, rsb):
        self.name, self.ch = name, ch
        P = [np.asarray(p, float) * S for p in paths]
        rec, x0, y1, m, H, bm = trace(P, pen_u)
        # potrace coords: X from left, Y up from bitmap bottom
        # font x = X - m + lsb ; font y = y1 + m - H + Y
        dx = -m + lsb
        dy = y1 + m - H
        self.rec = rec
        self.transform = (1, 0, 0, 1, dx, dy)
        ink_w = (np.vstack(P)[:, 0].max() - np.vstack(P)[:, 0].min()) + pen_u
        self.advance = int(round(ink_w + lsb + rsb))
        # profiles for kerning: per 20-unit band, leftmost/rightmost ink x
        self.bm, self.bm_dx, self.bm_top = bm, dx, y1 + m  # bitmap row r -> y = bm_top - r

    def draw_tt(self, glyf_pen):
        rec = RecordingPen()
        tp = TransformPen(rec, self.transform)
        self.rec.replay(tp)
        ap = AreaPen()
        rec.replay(ap)
        target = glyf_pen
        cu = Cu2QuPen(target, max_err=2.0, reverse_direction=False)
        # TrueType: outer contours clockwise -> negative area in AreaPen
        if ap.value > 0:
            rec.replay(ReverseContourPen(cu))
        else:
            rec.replay(cu)

    def profile(self, band=20, lo=-800, hi=1200):
        H, W = self.bm.shape
        nb = (hi - lo) // band
        left = np.full(nb, np.inf)
        right = np.full(nb, -np.inf)
        rows = np.nonzero(self.bm.any(axis=1))[0]
        for r in rows:
            y = self.bm_top - r
            b = int((y - lo) // band)
            if 0 <= b < nb:
                xs = np.nonzero(self.bm[r])[0]
                left[b] = min(left[b], xs[0] + self.bm_dx)
                right[b] = max(right[b], xs[-1] + self.bm_dx)
        return left, right


def build(weight, glyphs_json="glyphs.json", mono=False):
    cfg = WEIGHTS[weight]
    family = f"{FAMILY} Mono" if mono else FAMILY
    ps_family = f"{PS_FAMILY}Mono" if mono else PS_FAMILY
    pen_u = cfg["pen"] * S
    design = json.load(open(os.path.join(DESIGN, glyphs_json)))
    jobs = []
    for ch, vs in design.items():
        base = glyph_name(ch)
        tight = ch in TIGHT
        lsb = SB * (0.45 if tight else 1.0)
        rsb = SB * (0.9 if tight else 1.0)
        n = NSLOT if ch.isalnum() else 1
        variants = [vs[i % len(vs)]["paths"] for i in range(n)]
        inks = [(np.vstack(p)[:, 0].max() - np.vstack(p)[:, 0].min()) * S + pen_u for p in variants]
        shared = float(np.mean(inks))
        for i in range(n):
            nm = base if i == 0 else f"{base}.alt{i}"
            if mono:
                jobs.append((nm, ch, *mono_fit(variants[i], pen_u)))
            else:
                extra = (shared - inks[i]) / 2
                jobs.append((nm, ch, variants[i], lsb + extra, rsb + extra))

    with ThreadPoolExecutor(max_workers=8) as ex:
        built = list(ex.map(lambda j: Glyph(j[0], j[1], j[2], pen_u, j[3], j[4]), jobs))
    G = {g.name: g for g in built}
    for g in built:  # every version of a character must share its advance
        b = g.name.split(".alt")[0]
        assert abs(G[b].advance - g.advance) <= 1, (g.name, g.advance, G[b].advance)
        g.advance = G[b].advance

    spaces = ["space"] + [f"space.alt{i}" for i in range(1, NSLOT)]
    order = [".notdef"] + spaces + ["uni00A0"] + [g.name for g in built]
    fb = FontBuilder(UPM, isTTF=True)
    fb.setupGlyphOrder(order)
    cmap = {32: "space", 0xA0: "uni00A0"}
    for g in built:
        if g.ch and "." not in g.name:
            cmap[ord(g.ch)] = g.name
    fb.setupCharacterMap(cmap)

    glyf = {}
    metrics = {}
    # .notdef: a hand-drawn-ish box
    box = [np.array([[0, 0], [0.7, 0], [0.7, 1.56], [0, 1.56], [0, 0]])]
    if mono:
        bp, bl, br = mono_fit(box, pen_u)
        nd = Glyph(".notdef", None, bp, pen_u, bl, br)
    else:
        nd = Glyph(".notdef", None, box, pen_u, SB, SB)
    for g in [nd] + built:
        pen = TTGlyphPen(None)
        g.draw_tt(pen)
        gl = pen.glyph()
        glyf[g.name] = gl
    for nm in spaces + ["uni00A0"]:
        glyf[nm] = TTGlyphPen(None).glyph()
    fb.setupGlyf(glyf)
    for g in [nd] + built:
        gl = glyf[g.name]
        gl.recalcBounds(fb.font["glyf"])
        metrics[g.name] = (g.advance, getattr(gl, "xMin", 0))
    for i, nm in enumerate(spaces):
        metrics[nm] = (MONO_CELL if mono else int(SPACE * SLOT_SPACE[i]), 0)
    metrics["uni00A0"] = (MONO_CELL if mono else int(SPACE), 0)
    if mono:
        assert all(m[0] == MONO_CELL for m in metrics.values()), "mono advances drifted"
    fb.setupHorizontalMetrics(metrics)

    ymax = max(getattr(glyf[n], "yMax", 0) for n in glyf)
    ymin = min(getattr(glyf[n], "yMin", 0) for n in glyf)
    asc, desc = 950, -550
    fb.setupHorizontalHeader(ascent=asc, descent=desc, lineGap=0)
    M = json.load(open(os.path.join(DESIGN, "metrics.json")))
    xh = int(round(M["xt"] * S + pen_u / 2))
    cap = int(round(M["cap"] * S + pen_u / 2))
    style = weight
    fb.setupNameTable({
        "copyright": "Copyright 2026 Stavan",
        "familyName": family,
        "styleName": style,
        "uniqueFontIdentifier": f"{ps_family}-{style};{VERSION}",
        "fullName": f"{family} {style}",
        "version": f"Version {VERSION}",
        "psName": f"{ps_family}-{style}",
        "designer": "Stavan (handwriting)",
        "description": "A font made from Stavan's handwritten GoodNotes notes, using the real pen "
                       "strokes. Five variants per letter rotate automatically (calt).",
        "sampleText": "The quick brown fox jumps over the lazy dog.",
        "licenseDescription": OFL,
        "licenseInfoURL": "https://openfontlicense.org",
    })
    fb.setupOS2(
        sTypoAscender=asc, sTypoDescender=desc, sTypoLineGap=0,
        usWinAscent=max(asc, ymax), usWinDescent=max(-desc, -ymin),
        sxHeight=xh, sCapHeight=cap, usWeightClass=cfg["wclass"],
        fsSelection=(0x20 if weight == "Bold" else 0x40) | 0x80,  # BOLD/REGULAR + USE_TYPO_METRICS
        achVendID="STVN", fsType=0, version=4,
        panose=_panose(mono), xAvgCharWidth=MONO_CELL if mono else 0,
    )
    fb.setupPost(isFixedPitch=int(mono), underlinePosition=-180, underlineThickness=int(pen_u * 0.8))
    from fontTools.misc.timeTools import timestampNow
    fb.setupHead(unitsPerEm=UPM, fontRevision=float(VERSION), macStyle=1 if weight == "Bold" else 0,
                 created=timestampNow(), modified=timestampNow())

    fea, pairs = features(design, G, kern=not mono)
    if not mono:
        export_web(weight, pen_u, jobs, G, pairs, spaces)
        if weight == "Regular":
            export_svg_font(jobs, G, design)
    addOpenTypeFeaturesFromString(fb.font, fea)
    os.makedirs(DIST, exist_ok=True)
    base = os.path.join(DIST, f"{ps_family}-{style}")
    fb.save(base + ".ttf")
    from fontTools.ttLib import TTFont
    for flavor in ("woff", "woff2"):
        f = TTFont(base + ".ttf")
        f.flavor = flavor
        f.save(f"{base}.{flavor}")
    from common import WORK as SCRATCH
    os.makedirs(SCRATCH, exist_ok=True)
    open(os.path.join(SCRATCH, f"features-{style}.fea"), "w").write(fea)
    return base + ".ttf"


def _panose(mono):
    from fontTools.ttLib.tables.O_S_2f_2 import Panose
    p = Panose()
    p.bFamilyType = 3          # latin hand written
    p.bProportion = 3 if mono else 0   # for family type 3, 3 = monospaced
    return p


def features(design, G, kern=True):
    slots = [[] for _ in range(NSLOT)]
    for ch in design:
        if not ch.isalnum():
            continue
        b = glyph_name(ch)
        for i in range(NSLOT):
            slots[i].append(b if i == 0 else f"{b}.alt{i}")
    for i in range(NSLOT):
        slots[i].append("space" if i == 0 else f"space.alt{i}")
    lines = ["languagesystem DFLT dflt;", "languagesystem latn dflt;", ""]
    for i, sl in enumerate(slots):
        lines.append(f"@s{i} = [{' '.join(sl)}];")
    lines.append("")
    # Rotate through the writer's variants; spaces take part so repeated words differ too.
    lines.append("feature calt {")
    lines.append("  lookup cycle {")
    for k in range(NSLOT - 1):
        lines.append(f"    sub @s{k} @s0' by @s{k + 1};")
    lines.append("  } cycle;")
    lines.append("} calt;")
    lines.append("")
    if kern:
        kfea, pairs = kerning(design, G)
        lines.append(kfea)
    else:
        pairs = []
    return "\n".join(lines), pairs


def kerning(design, G, band=20, lo=-800, hi=1200):
    """Optical kerning from ink profiles, per base-letter class (incl. variants)."""
    classes = {}
    for ch, vs in design.items():
        b = glyph_name(ch)
        members = [m for m in G if m == b or m.startswith(b + ".alt")]
        if not members:
            continue
        L = R = None
        for m in members:
            l, r = G[m].profile(band, lo, hi)
            adv = G[m].advance
            rr = adv - r  # distance from ink to advance edge (right side bearing profile)
            L = l if L is None else np.minimum(L, l)
            R = rr if R is None else np.minimum(R, rr)
        # dilate a band so shapes don't collide diagonally
        L = np.minimum(L, np.minimum(np.r_[L[1:], np.inf], np.r_[np.inf, L[:-1]]) + 8)
        R = np.minimum(R, np.minimum(np.r_[R[1:], np.inf], np.r_[np.inf, R[:-1]]) + 8)
        classes[ch] = (b, members, L, R)
    ref = 2 * SB
    kern_chars = [c for c in classes if c.isalnum() or c in ".,:;!?)(-'\"&"]
    out = []
    pairs = []
    for a in kern_chars:
        for c in kern_chars:
            _, _, _, Ra = classes[a]
            _, _, Lc, _ = classes[c]
            gap = Ra + Lc
            ok = np.isfinite(gap)
            if ok.sum() < 3:
                continue
            g = gap[ok].min()
            k = (ref - g) * 0.6
            k = max(-0.3 * S, min(0.0, k))
            if k <= -20:
                pairs.append((a, c, int(round(k / 2) * 2)))
    for ch in kern_chars:
        b, members, _, _ = classes[ch]
        out.append(f"@k_{b.replace('.', '_')} = [{' '.join(members)}];")
    out.append("feature kern {")
    for a, c, k in pairs:
        A = glyph_name(a).replace(".", "_")
        C = glyph_name(c).replace(".", "_")
        out.append(f"  pos @k_{A} @k_{C} {k};")
    out.append("} kern;")
    print(f"kerning pairs: {len(pairs)}", file=sys.stderr)
    return "\n".join(out), pairs


def _rdp(p, eps):
    """Ramer-Douglas-Peucker simplification of one polyline."""
    if len(p) < 3:
        return p
    a, b = p[0], p[-1]
    d = b - a
    n = np.hypot(*d)
    q = p - a
    dist = np.abs(d[0] * q[:, 1] - d[1] * q[:, 0]) / n if n else np.hypot(q[:, 0], q[:, 1])
    i = int(np.argmax(dist))
    if dist[i] <= eps:
        return np.array([a, b])
    return np.vstack([_rdp(p[:i + 1], eps)[:-1], _rdp(p[i:], eps)])


WEB = os.path.join(ROOT, "site", "data")


def export_web(weight, pen_u, jobs, G, pairs, spaces):
    """Pen centrelines + metrics for the website's live handwriting replay.

    strokes.json (weight independent): glyph -> list of flat [x,y,x,y...] in font units, y up, drawing order.
    stavan-<weight>.json: advances, stroke x offsets, kerning, slot info -- mirrors the calt + kern features.
    """
    os.makedirs(WEB, exist_ok=True)
    strokes, adv, dx, cmap = {}, {}, {}, {}
    for nm, ch, paths, lsb, rsb in jobs:
        P = [np.asarray(p, float) * S for p in paths]
        x0 = np.vstack(P)[:, 0].min()
        strokes[nm] = [np.round(_rdp(p, 1.5)).astype(int).ravel().tolist() for p in P]
        adv[nm] = G[nm].advance
        dx[nm] = round(lsb - x0, 1)
        if "." not in nm:
            cmap[ch] = nm
    for i, nm in enumerate(spaces):
        adv[nm] = int(SPACE * SLOT_SPACE[i])
    kern = {}
    for a, c, k in pairs:
        kern.setdefault(a, {})[c] = k
    meta = dict(upm=UPM, xh=S, pen=round(pen_u, 1), slots=NSLOT, asc=950, desc=-550,
                cmap=cmap, adv=adv, dx=dx, kern=kern)
    json.dump(meta, open(os.path.join(WEB, f"stavan-{weight}.json"), "w"), separators=(",", ":"), ensure_ascii=False)
    json.dump(strokes, open(os.path.join(WEB, "strokes.json"), "w"), separators=(",", ":"))


def export_svg_font(jobs, G, design):
    """Single-line SVG font (pen centrelines, not outlines) for pen plotters, laser engravers and
    Inkscape's Hershey Text. Every character uses its first version; SVG fonts have no rotation."""
    from xml.sax.saxutils import quoteattr
    out = ['<?xml version="1.0" encoding="UTF-8"?>',
           '<svg xmlns="http://www.w3.org/2000/svg" version="1.1"><defs>',
           f'<font id="StavanSingleLine" horiz-adv-x="{int(SPACE)}">',
           f'<font-face font-family="Stavan Single Line" units-per-em="{UPM}" ascent="950" descent="-550" '
           f'x-height="{S}" cap-height="{int(json.load(open(os.path.join(DESIGN, "metrics.json")))["cap"] * S)}"/>',
           f'<missing-glyph horiz-adv-x="{int(SPACE)}"/>',
           f'<glyph unicode=" " glyph-name="space" horiz-adv-x="{int(SPACE)}"/>']
    for nm, ch, paths, lsb, rsb in jobs:
        if "." in nm:
            continue
        P = [np.asarray(p, float) * S for p in paths]
        dx = lsb - np.vstack(P)[:, 0].min()
        d = "".join("M" + "L".join(f"{x + dx:.0f} {y:.0f}" for x, y in _rdp(p, 1.0)) for p in P)
        out.append(f'<glyph unicode={quoteattr(ch)} glyph-name="{nm}" horiz-adv-x="{G[nm].advance}" d="{d}"/>')
    out += ["</font></defs></svg>", ""]
    open(os.path.join(DIST, "Stavan-SingleLine.svg"), "w").write("\n".join(out))


if __name__ == "__main__":
    targets = sys.argv[1:] or ["Regular", "Bold", "Mono"]
    for w in targets:
        print(build("Regular", mono=True) if w == "Mono" else build(w))
