"""Characters derived from the writer's own strokes when they never appear on their own in the notes.

Only fills gaps: anything harvested from the notes always wins.
"""
import numpy as np
from select_variants import bounds


def _cp(v):
    return [np.asarray(p, float).copy() for p in v["paths"]]


def shift(paths, dx=0.0, dy=0.0):
    return [np.c_[p[:, 0] + dx, p[:, 1] + dy] for p in paths]


def scale(paths, sx, sy=None):
    sy = sx if sy is None else sy
    return [np.c_[p[:, 0] * sx, p[:, 1] * sy] for p in paths]


def norm_left(paths):
    x0 = bounds(paths)[0]
    return shift(paths, -x0)


def width(paths):
    b = bounds(paths)
    return b[1] - b[0]


def rot(paths, deg):
    a = np.radians(deg); c, s = np.cos(a), np.sin(a)
    x0, x1, y0, y1 = bounds(paths); cx, cy = (x0 + x1) / 2, (y0 + y1) / 2
    return [np.c_[cx + (p[:, 0] - cx) * c - (p[:, 1] - cy) * s, cy + (p[:, 0] - cx) * s + (p[:, 1] - cy) * c] for p in paths]


def variants(g, ch):
    return g.get(ch, [])


def add(g, ch, list_of_paths, src="constructed"):
    if ch in g or not list_of_paths:
        return
    g[ch] = [dict(paths=norm_left(p), src=src) for p in list_of_paths]


def add_missing(g, m):
    xt = m.get("xt") or 1.0
    cap = m.get("cap") or 1.5
    dots = [_cp(v) for v in variants(g, ".")]
    commas = [_cp(v) for v in variants(g, ",")]
    quotes = [_cp(v) for v in variants(g, "'")]
    dashes = [_cp(v) for v in variants(g, "-")]
    # apostrophe from a comma lifted to cap height
    if not quotes and commas:
        quotes = [shift(c, 0, cap - bounds(c)[3]) for c in commas]
        add(g, "'", quotes)
    if quotes:
        add(g, "’", quotes)
        add(g, "‘", [rot(q, 180) for q in quotes])
        dq = [q + shift(quotes[(i + 1) % len(quotes)], width(q) + 0.12) for i, q in enumerate(quotes)]
        add(g, '"', dq)
        add(g, "”", dq)
        add(g, "“", [rot(d, 180) for d in dq])
    if dots:
        add(g, ":", [d + shift(dots[(i + 1) % len(dots)], 0, xt * 0.75) for i, d in enumerate(dots)])
        add(g, "…", [d + shift(dots[(i + 1) % len(dots)], 0.3) + shift(dots[(i + 2) % len(dots)], 0.6) for i, d in enumerate(dots)])
        if commas:
            add(g, ";", [c + shift(dots[i % len(dots)], 0.02, xt * 0.75) for i, c in enumerate(commas)])
    if dashes:
        add(g, "–", [scale(d, 1.5, 1.0) for d in dashes])
        add(g, "—", [scale(d, 2.4, 1.0) for d in dashes])
        add(g, "_", [shift(scale(d, 1.6, 1.0), 0, -0.25 - bounds(d)[2]) for d in dashes])
    # '!' never appears in the notes: the writer's own straight stroke (from l / 1) over their own dot
    if "!" not in g and dots:
        src = [v for c in ("l", "1", "I") for v in g.get(c, []) if len(v["paths"]) == 1][:5]
        vs = []
        for i, v in enumerate(src):
            p = _cp(v)
            b = bounds(p)
            f = (cap - 0.32) / max(b[3] - b[2], 1e-3)
            stem = [np.c_[(q[:, 0] - b[0]) * f * 0.6, (q[:, 1] - b[2]) * f + 0.32] for q in p]
            d = dots[i % len(dots)]
            db, sb = bounds(d), bounds(stem)
            dot = shift(d, (sb[0] + sb[1]) / 2 - (db[0] + db[1]) / 2, -db[2])
            vs.append(stem + dot)
        add(g, "!", vs)
    # Rare capitals the notes may not have: built from the writer's own strokes.
    if "Q" not in g and "O" in g and commas:
        vs = []
        for i, v in enumerate(g["O"]):
            o = _cp(v)
            ob = bounds(o)
            t = rot(sized_mark(commas[i % len(commas)], 0.45), -35)
            tb = bounds(t)
            vs.append(o + shift(t, ob[0] + 0.62 * (ob[1] - ob[0]) - tb[0], ob[2] + 0.12 - tb[3] + 0.2))
        add(g, "Q", vs)
    if "J" not in g and "j" in g and dashes:
        vs = []
        for i, v in enumerate(g["j"]):
            body = [q for q in _cp(v) if q[:, 1].min() < xt * 1.05] or _cp(v)
            bb = bounds(body)
            f = cap / max(bb[3] - bb[2], 1e-3)
            body = [np.c_[(q[:, 0] - bb[0]) * f, (q[:, 1] - bb[2]) * f - 0.1] for q in body]
            nb = bounds(body)
            d = scale(dashes[i % len(dashes)], 0.9, 1.0)
            db = bounds(d)
            top = [q for q in body if q[:, 1].max() > nb[3] - 0.05]
            tx = top[0][np.argmax(top[0][:, 1]), 0] if top else nb[1]
            vs.append(body + shift(d, tx - (db[0] + db[1]) / 2, nb[3] - (db[2] + db[3]) / 2))
        add(g, "J", vs)
    add_symbols(g, m)
    add_accents(g, m)
    return g


def add_symbols(g, m):
    """Symbols that never appear in the notes, assembled from the writer's own strokes."""
    xt, cap = m.get("xt") or 1.0, m.get("cap") or 1.6
    V = lambda ch: [_cp(v) for v in g.get(ch, [])]
    slashes, dashes, ones = V("/"), V("-"), V("1") or V("l")
    n = 5

    def fitbox(p, w=None, h=None, y0=0.0):
        b = bounds(p)
        sx = (w / max(b[1] - b[0], 1e-3)) if w else None
        sy = (h / max(b[3] - b[2], 1e-3)) if h else None
        sx = sx or sy or 1.0
        sy = sy or sx
        return [np.c_[(q[:, 0] - b[0]) * sx, (q[:, 1] - b[2]) * sy + y0] for q in p]

    def centre_x(p, cx):
        b = bounds(p)
        return shift(p, cx - (b[0] + b[1]) / 2)

    if "`" not in g and "'" in g:
        add(g, "`", [fitbox(rot(t, 30), h=0.3, y0=1.25) for t in V("'")])
    if "^" not in g and "v" in g:
        add(g, "^", [fitbox(rot(v, 180), h=0.42, y0=1.05) for v in V("v")[:n]])
    if "\\" not in g and slashes:
        add(g, "\\", [[np.c_[-q[:, 0], q[:, 1]] for q in sl] for sl in slashes[:n]])
    if "#" not in g and slashes and dashes:
        vs = []
        for i in range(n):
            a = fitbox(slashes[i % len(slashes)], h=1.25)
            b = shift(fitbox(slashes[(i + 1) % len(slashes)], h=1.25), 0.38)
            d1 = fitbox(dashes[i % len(dashes)], w=0.95, y0=0.4)
            d2 = fitbox(dashes[(i + 2) % len(dashes)], w=0.95, y0=0.82)
            vs.append(a + b + shift(d1, -0.05) + shift(d2, 0.1))
        add(g, "#", vs)
    if "%" not in g and slashes and "o" in g:
        os_ = V("o")
        vs = []
        for i in range(n):
            sl = fitbox(slashes[i % len(slashes)], h=1.4)
            o1 = fitbox(os_[i % len(os_)], h=0.38, y0=1.0)
            o2 = shift(fitbox(os_[(i + 1) % len(os_)], h=0.38, y0=0.0), 0.62)
            vs.append(sl + shift(o1, -0.12) + o2)
        add(g, "%", vs)
    if "$" not in g and "S" in g and ones:
        vs = []
        for i, sv in enumerate(V("S")[:n]):
            S_ = fitbox(sv, h=cap * 0.92, y0=0.05)
            b = bounds(S_)
            bar = centre_x(fitbox(ones[i % len(ones)], h=cap * 1.15, y0=-0.12), (b[0] + b[1]) / 2)
            vs.append(S_ + bar)
        add(g, "$", vs)
    if "@" not in g and "a" in g and "C" in g:
        vs = []
        for i, cv in enumerate(V("C")[:n]):
            C_ = fitbox(cv, h=1.35, y0=-0.2)
            a_ = fitbox(V("a")[i % len(V("a"))], h=0.6, y0=0.18)
            b = bounds(C_)
            vs.append(C_ + centre_x(a_, (b[0] + b[1]) / 2 + 0.05))
        add(g, "@", vs)
    if "&" not in g and "8" in g and slashes:
        vs = []
        for i, ev in enumerate(V("8")[:n]):
            e = fitbox(ev, h=cap * 0.95)
            b = bounds(e)
            leg = fitbox([np.c_[-q[:, 0], q[:, 1]] for q in slashes[i % len(slashes)]], h=0.75)
            vs.append(e + shift(leg, b[1] - 0.25))
        add(g, "&", vs)
    for o, c, br in (("{", "(", "["), ("}", ")", "]")):
        if o not in g and c in g and dashes:
            vs = []
            for i, pv in enumerate(V(c)[:n]):
                b = bounds(pv)
                tick = fitbox(dashes[i % len(dashes)], w=0.22, y0=(b[2] + b[3]) / 2)
                x = b[0] - 0.12 if o == "{" else b[1] - 0.1
                vs.append(pv + shift(tick, x))
            add(g, o, vs)


def sized_mark(mark, h):
    b = bounds(mark)
    f = h / max(b[3] - b[2], 1e-3)
    return scale(shift(mark, -b[0], -b[2]), f)


def _mark_from(g, ch):
    return [_cp(v) for v in g.get(ch, [])]


def add_accents(g, m):
    """Western European accents, made from the writer's own apostrophe, dots, comma, ^ and ~."""
    xt = m.get("xt") or 1.0
    cap = m.get("cap") or 1.5
    ticks = _mark_from(g, "'") or _mark_from(g, "\u2019")
    dots = _mark_from(g, ".")
    commas = _mark_from(g, ",")
    hats = _mark_from(g, "^")
    tildes = _mark_from(g, "~")

    def place(mark, base, top, gap=0.18):
        mb = bounds(mark)
        bb = bounds(base)
        cx = (bb[0] + bb[1]) / 2 - (mb[0] + mb[1]) / 2
        return shift(mark, cx, top + gap - mb[2])

    def sized(mark, h):
        b = bounds(mark)
        f = h / max(b[3] - b[2], 1e-3)
        return scale(shift(mark, -b[0], -b[2]), f)

    def body(ch, v):
        p = _cp(v)
        if ch in "ij":   # drop the dot: strokes that sit entirely above the x-height
            p = [q for q in p if q[:, 1].min() < xt * 1.05] or p
        return p

    def top_of(ch, p):
        return bounds(p)[3]

    marks = {}
    if ticks:
        marks["acute"] = [rot(sized(t, 0.32), -25) for t in ticks]
        marks["grave"] = [rot(sized(t, 0.32), 25) for t in ticks]
    if dots:
        marks["dieresis"] = [d + shift(dots[(i + 1) % len(dots)], 0.28) for i, d in enumerate(dots)]
    if hats:
        marks["circumflex"] = [sized(h, 0.22) for h in hats]
    if tildes:
        marks["tilde"] = [sized(t, 0.14) for t in tildes]
    table = {
        "acute": "\u00e1\u00e9\u00ed\u00f3\u00fa\u00c1\u00c9\u00cd\u00d3\u00da",
        "grave": "\u00e0\u00e8\u00ec\u00f2\u00f9\u00c0\u00c8\u00cc\u00d2\u00d9",
        "dieresis": "\u00e4\u00eb\u00ef\u00f6\u00fc\u00ff\u00c4\u00cb\u00cf\u00d6\u00dc",
        "circumflex": "\u00e2\u00ea\u00ee\u00f4\u00fb\u00c2\u00ca\u00ce\u00d4\u00db",
        "tilde": "\u00e3\u00f1\u00f5\u00c3\u00d1\u00d5",
    }
    import unicodedata
    for kind, chars in table.items():
        if kind not in marks:
            continue
        for ac in chars:
            base_ch = unicodedata.normalize("NFD", ac)[0]
            if base_ch not in g or ac in g:
                continue
            vs = []
            for i, v in enumerate(g[base_ch]):
                b = body(base_ch, v)
                mk = marks[kind][i % len(marks[kind])]
                vs.append(b + place(mk, b, top_of(base_ch, b)))
            add(g, ac, vs)
    if commas:
        for ac, base_ch in (("\u00e7", "c"), ("\u00c7", "C")):
            if base_ch in g and ac not in g:
                vs = []
                for i, v in enumerate(g[base_ch]):
                    b = _cp(v)
                    c = sized(commas[i % len(commas)], 0.3)
                    bb, cb = bounds(b), bounds(c)
                    vs.append(b + shift(c, (bb[0] + bb[1]) / 2 - (cb[0] + cb[1]) / 2, -0.32 - cb[2]))
                add(g, ac, vs)
