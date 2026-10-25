"""Assemble the glyph design from picks: normalize heights to the writer's own medians, add small bounce.

Output: design/glyphs.json {char: [{paths: [[[x,y],...]], src}]}  (x-height units, baseline 0, y up)
"""
import json, os, pickle
import numpy as np
from common import ROOT, WORK
from select_variants import bounds

DESIGN = f"{ROOT}/design"


def class_extents(ranked):
    """Median (bottom, top) per char from its most typical samples."""
    ext = {}
    for ch, ss in ranked.items():
        top = ss[:max(3, len(ss) // 3)]
        b = np.array([bounds(s["paths"]) for s in top])
        ext[ch] = (float(np.median(b[:, 2])), float(np.median(b[:, 3])))
    # keep families consistent: one x-height, one ascender, one cap height, one digit height
    def med(chars, i):
        v = [ext[c][i] for c in chars if c in ext]
        return float(np.median(v)) if v else None
    xt = med("acemnorsuvwxz", 1)
    asc = med("bdhkl", 1)
    cap = med("ABCDEFHIKLMNPRTUVWXYZ", 1)
    dig = med("0123456789", 1)
    desc = med("gpqy", 0)
    for ch in list(ext):
        lo, hi = ext[ch]
        if ch in "acemnorsuvwxz":
            ext[ch] = (0.0, xt)
        elif ch in "bdhkl":
            ext[ch] = (0.0, asc)
        elif ch in "gpqy":
            ext[ch] = (desc, xt)
        elif ch.isupper() and ch not in "JQ":
            ext[ch] = (0.0, cap)
        elif ch.isdigit():
            ext[ch] = (0.0, dig)
    return ext, dict(xt=xt, asc=asc, cap=cap, dig=dig, desc=desc)


def fit(paths, lo, hi):
    """Light touch: keep the letter's own size and its own position on the line.
    Only letters more than 25% off the writer's usual size for that character are scaled back in."""
    x0, x1, y0, y1 = bounds(paths)
    h = y1 - y0
    out = [np.c_[p[:, 0] - x0, p[:, 1]] for p in paths]
    if hi - lo < 0.3 or h < 0.3:
        return out
    r = (hi - lo) / h
    s = 1.0 if 0.8 <= r <= 1.25 else (r / 1.25 if r > 1.25 else r / 0.8)
    return [np.c_[p[:, 0] * s, p[:, 1] * s] for p in out]


def build():
    ranked = pickle.load(open(f"{WORK}/ranked.pkl", "rb"))
    picks = json.load(open(f"{DESIGN}/picks.json"))
    ext, metrics = class_extents(ranked)
    index = {(ch, s["wid"], s["gi"]): s for ch, ss in ranked.items() for s in ss}
    g = {}
    for ch, srcs in picks.items():
        vs = []
        for wid, gi in srcs:
            s = index[(ch, wid, gi)]
            vs.append(dict(paths=fit(s["paths"], *ext[ch]), src=[wid, gi]))
        if vs:
            g[ch] = vs
    return g, metrics


def save(g, metrics):
    out = {ch: [dict(paths=[np.round(p, 4).tolist() for p in v["paths"]], src=v.get("src")) for v in vs] for ch, vs in g.items()}
    json.dump(out, open(f"{DESIGN}/glyphs.json", "w"))
    json.dump(metrics, open(f"{DESIGN}/metrics.json", "w"), indent=1)


if __name__ == "__main__":
    g, m = build()
    # '*' only ever appears raised (exponents) in the notes; sit it mid-line like a typed asterisk
    for v in g.get("*", []):
        b = bounds(v["paths"])
        dy = 0.62 - (b[2] + b[3]) / 2
        v["paths"] = [np.c_[p[:, 0], p[:, 1] + dy] for p in v["paths"]]
    import construct
    g = construct.add_missing(g, m)
    save(g, m)
    print(len(g), "glyphs", sum(len(v) for v in g.values()), "variants", {k: round(v, 3) for k, v in m.items()})
