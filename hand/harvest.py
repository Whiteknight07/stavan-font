"""Match transcriptions to stroke groups -> normalized letter samples.

Adapted from harshpreet-hand/pipeline/harvest.py (MIT), working on vector strokes.
Output: work/samples.pkl  list of dict(ch, wid, paths=[Nx2 arrays, x-height units, baseline y=0, y up], xh, exact)
"""
import glob, os, pickle, re
from collections import Counter
import numpy as np
from common import WORK

XLINE = set("acemnorsuvwxzgpqy")
BASE = set("abcdefhiklmnorstuvwxz") | set("ABCDEFGHIJKLMNOPRSTUVWXYZ0123456789")
ALLOWED = set("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,:;'\"!?()[]{}-+=/*&%$#@<>_^~|")


def parse(text):
    toks, i = [], 0
    while i < len(text):
        ch = text[i]
        if ch == " ":
            i += 1
            continue
        toks.append(None if ch == "?" else ch)
        i += 1
    return toks


def robust_line(xs, ys):
    xs = np.asarray(xs, float); ys = np.asarray(ys, float)
    if len(xs) >= 3 and np.ptp(xs) > 1e-3:
        sl = [(ys[j] - ys[i]) / (xs[j] - xs[i]) for i in range(len(xs)) for j in range(i + 1, len(xs)) if xs[j] != xs[i]]
        m = float(np.clip(np.median(sl), -0.08, 0.08))
    else:
        m = 0.0
    return m, float(np.median(ys - m * xs))


def gbox(w, gi):
    a = np.vstack([w["strokes"][k] for k in w["groups"][gi]])
    x0, y0 = a.min(0)
    x1, y1 = a.max(0)
    return x0, y0, x1 - x0, y1 - y0


def dot_strokes(w, gi, base_y, xh):
    """i/j dots are often drawn off to the side, so they land in their own little group.
    Return the strokes of small marks sitting at dot height near group gi."""
    g = w["groups"][gi]
    a = np.vstack([w["strokes"][k] for k in g])
    gx0, gx1 = a[:, 0].min(), a[:, 0].max()
    out = []
    for j, h in enumerate(w["groups"]):
        if j == gi:
            continue
        for k in h:
            b = w["strokes"][k]
            if np.ptp(b[:, 0]) > 0.4 * xh or np.ptp(b[:, 1]) > 0.4 * xh:
                continue
            cx, cy = b[:, 0].mean(), b[:, 1].mean()
            height = (base_y - cy) / xh
            dx = max(gx0 - cx, cx - gx1, 0) / xh
            if 0.95 < height < 2.6 and dx < 0.8:
                out.append(b)
    return out


def load_labels():
    out = {}
    for f in sorted(glob.glob(f"{WORK}/labels/sheet_*.txt")):
        for line in open(f, encoding="utf-8", errors="replace"):
            line = line.strip()
            m = re.match(r"^(\d+)\s*:\s*(.+)$", line)
            if not m:
                continue
            text = m.group(2).strip()
            if not text or any(c not in ALLOWED and c not in " ?" for c in text):
                continue
            out[int(m.group(1))] = text
    return out


def default_wh(ch):
    if ch in ".,:;'":
        return 0.25, 0.3
    if ch in "-":
        return 0.5, 0.15
    if ch in "/()[]{}":
        return 0.5, 1.6
    if ch in "il1I|":
        return 0.3, 1.5
    if ch in "mwMW":
        return 1.4, 1.0 if ch.islower() else 1.6
    if ch.isupper() or ch.isdigit():
        return 0.9, 1.6
    if ch in "bdfhklt":
        return 0.8, 1.6
    if ch in "gjpqy":
        return 0.8, 1.6
    return 0.8, 1.0


def align(w, toks, Wd, Hd, gap):
    G = [gbox(w, i) for i in range(len(w["groups"]))]
    n, m = len(G), len(toks)
    ws = [Wd.get(t, default_wh(t)[0]) if t else 0.8 for t in toks]
    hs = [Hd.get(t, default_wh(t)[1]) if t else 1.2 for t in toks]
    x0 = G[0][0]
    x1 = max(g[0] + g[2] for g in G)
    s = (x1 - x0) / max(0.1, sum(ws) + gap * (m - 1))
    INF = 1e9
    D = np.full((n + 1, m + 1), INF)
    back = {}
    D[0, 0] = 0
    for i in range(n + 1):
        for j in range(m + 1):
            if D[i, j] >= INF or i == n:
                continue
            g = G[i]
            if g[3] < 0.55 * s and g[2] < 0.6 * s:
                c = D[i, j] + 1.5
                if c < D[i + 1, j]:
                    D[i + 1, j] = c; back[(i + 1, j)] = (i, j, "noise")
            for k in (1, 2, 3):
                if j + k > m:
                    break
                exp_w = s * (sum(ws[j:j + k]) + gap * (k - 1))
                cw = (np.log(max(g[2], 1e-3) / max(exp_w, 1e-3))) ** 2 / 0.12
                ch = (np.log(max(g[3], 1e-3) / max(s * hs[j], 1e-3))) ** 2 / 0.08 if k == 1 else 0.0
                c = D[i, j] + cw + ch + (0 if k == 1 else 2.0 * (k - 1))
                if c < D[i + 1, j + k]:
                    D[i + 1, j + k] = c; back[(i + 1, j + k)] = (i, j, k, cw + ch)
            if i + 2 <= n and j + 1 <= m:
                g2 = G[i + 1]
                uw = g2[0] + g2[2] - g[0]
                cw = (np.log(max(uw, 1e-3) / max(s * ws[j], 1e-3))) ** 2 / 0.12
                c = D[i, j] + cw + 2.5
                if c < D[i + 2, j + 1]:
                    D[i + 2, j + 1] = c; back[(i + 2, j + 1)] = (i, j, "split")
    if D[n, m] >= INF:
        return []
    pairs, i, j = [], n, m
    while (i, j) != (0, 0):
        b = back[(i, j)]
        if len(b) == 4 and b[2] == 1 and b[3] < 1.5 and toks[b[1]] is not None:
            pairs.append((b[0], toks[b[1]]))
        i, j = b[0], b[1]
    return pairs[::-1]


def word_lines(w, pairs):
    xs_b, ys_b, xs_t, ys_t = [], [], [], []
    for gi, ch in pairs:
        x, y, bw, bh = gbox(w, gi)
        cx = x + bw / 2
        if ch in BASE:
            xs_b.append(cx); ys_b.append(y + bh)
        if ch in XLINE:
            xs_t.append(cx); ys_t.append(y)
    base = robust_line(xs_b, ys_b) if xs_b else None
    xl = robust_line(xs_t, ys_t) if xs_t else None
    xh = None
    if base and xl and len(xs_t) >= 2 and len(xs_b) >= 2:
        mid = w["bbox"][0] + w["bbox"][2] / 2
        v = (base[0] * mid + base[1]) - (xl[0] * mid + xl[1])
        if v > 0.25 * w["u"]:
            xh = v
    return base, xl, xh


def letter_stats(exact):
    Wd, Hd, gaps = {}, {}, []
    for w, pairs, xh in exact:
        prev = None
        for gi, ch in pairs:
            x, y, bw, bh = gbox(w, gi)
            Wd.setdefault(ch, []).append(bw / xh)
            Hd.setdefault(ch, []).append(bh / xh)
            if prev is not None and prev[0] == gi - 1:
                px = gbox(w, prev[0])
                gaps.append((x - (px[0] + px[2])) / xh)
            prev = (gi, ch)
    return ({k: float(np.median(v)) for k, v in Wd.items()}, {k: float(np.median(v)) for k, v in Hd.items()},
            float(np.median(gaps)) if gaps else 0.3)


def harvest():
    words = {w["wid"]: w for w in pickle.load(open(f"{WORK}/words.pkl", "rb"))}
    labels = load_labels()
    stats = Counter()
    items = [(words[wid], parse(t), t) for wid, t in labels.items() if wid in words]
    exact = []
    for w, toks, t in items:
        if len(toks) == len(w["groups"]) and len(toks) >= 3:
            pairs = [(i, c) for i, c in enumerate(toks) if c]
            _, _, xh = word_lines(w, pairs)
            if xh:
                exact.append((w, pairs, xh))
    Wd, Hd, gap = letter_stats(exact)
    # median x-height per page (in u units) as a fallback for short words
    page_xh = {}
    resolved = []
    for w, toks, t in items:
        if len(toks) == len(w["groups"]):
            pairs = [(i, c) for i, c in enumerate(toks) if c]
            stats["exact"] += 1
        else:
            pairs = align(w, toks, Wd, Hd, gap) if len(w["groups"]) else []
            if not pairs:
                stats["mismatch"] += 1
                continue
            stats["aligned"] += 1
        base, xl, xh = word_lines(w, pairs)
        if xh:
            page_xh.setdefault(w["pid"], []).append(xh)
        resolved.append((w, pairs, t, base, xl, xh))
    page_xh = {k: float(np.median(v)) for k, v in page_xh.items()}
    samples = []
    for w, pairs, t, base, xl, xh in resolved:
        own = xh is not None
        xh = xh or page_xh.get(w["pid"])
        if xh is None:
            continue
        if base is None:
            if xl is None:
                continue
            base = (xl[0], xl[1] + xh)
        m, b = base
        for gi, ch in pairs:
            ks = w["groups"][gi]
            strokes = [w["strokes"][k] for k in ks]
            if ch in "ij" and len(strokes) == 1:
                cx = strokes[0][:, 0].mean()
                strokes = strokes + dot_strokes(w, gi, m * cx + b, xh)
            x0 = min(st[:, 0].min() for st in strokes)
            paths = []
            for st in strokes:
                p = st.astype(np.float64)
                bl = m * p[:, 0] + b
                paths.append(np.c_[(p[:, 0] - x0) / xh, (bl - p[:, 1]) / xh])
            samples.append(dict(ch=ch, wid=w["wid"], pid=w["pid"], gi=gi, text=t, paths=paths, xh=xh,
                                pen=float(np.median([w["widths"][k] for k in ks])) / xh,
                                own_xh=own, nletters=len(pairs), exact=len(pairs) == len(w["groups"])))
    samples += harvest_verified(page_xh)
    stats["verified"] = sum(1 for s in samples if s.get("verified"))
    return samples, stats, Wd, Hd, gap


LO_DEFAULT = {"j": -0.75, "g": -0.75, "p": -0.75, "q": -0.75, "y": -0.75, ";": -0.3, ",": -0.3, "Q": -0.1,
              "^": 0.85, "'": 1.0, '"': 1.0, "*": 0.5, "~": 0.35, "-": 0.4, "=": 0.25, "+": 0.15, "_": -0.15,
              "<": 0.1, ">": 0.1, "(": -0.3, ")": -0.3, "[": -0.3, "]": -0.3, "{": -0.3, "}": -0.3, "|": -0.3}


def harvest_verified(page_xh):
    """Samples confirmed by Sol from the shape search (work/verify)."""
    import json
    vdir = f"{WORK}/verify"
    if not os.path.exists(f"{vdir}/index.json"):
        return []
    idx = json.load(open(f"{vdir}/index.json"))
    words = {w["wid"]: w for w in pickle.load(open(f"{WORK}/words.pkl", "rb"))}
    out, seen = [], set()
    for f in sorted(glob.glob(f"{vdir}/answers_*.txt")):
        for line in open(f, encoding="utf-8", errors="replace"):
            m = re.match(r"^(\w+)\s*:\s*(\S)\s*$", line.strip())
            if not m or m.group(1) not in idx or m.group(2) not in ALLOWED:
                continue
            wid, gi, _ = idx[m.group(1)]
            ch = m.group(2)
            if (wid, gi) in seen:
                continue
            seen.add((wid, gi))
            w = words[wid]
            xh = page_xh.get(w["pid"], 0.75 * w["u"])
            ks = w["groups"][gi]
            a = np.vstack([w["strokes"][k] for k in ks])
            bottom = a[:, 1].max()
            others = [gbox(w, j) for j in range(len(w["groups"])) if j != gi]
            if len(others) >= 2 and ch not in LO_DEFAULT:
                base = float(np.median([o[1] + o[3] for o in others]))
                if abs(base - bottom) > 0.35 * xh:
                    base = bottom
            else:
                base = bottom + LO_DEFAULT.get(ch, 0.0) * xh
            x0 = a[:, 0].min()
            paths = [np.c_[(w["strokes"][k][:, 0] - x0) / xh, (base - w["strokes"][k][:, 1]) / xh].astype(np.float64) for k in ks]
            out.append(dict(ch=ch, wid=wid, pid=w["pid"], gi=gi, text="(verified)", paths=paths, xh=xh,
                            pen=float(np.median([w["widths"][k] for k in ks])) / xh,
                            own_xh=False, nletters=1, exact=False, verified=True))
    return out


if __name__ == "__main__":
    samples, stats, Wd, Hd, gap = harvest()
    pickle.dump(samples, open(f"{WORK}/samples.pkl", "wb"))
    c = Counter(s["ch"] for s in samples)
    print(dict(stats), "samples", len(samples), "gap", round(gap, 2))
    for grp in ("abcdefghijklmnopqrstuvwxyz", "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "0123456789"):
        print("  ".join(f"{ch}{c.get(ch, 0)}" for ch in grp))
    print("  ".join(f"{k}{v}" for k, v in sorted(c.items()) if not k.isalnum()))
    print("pen/xh median", round(float(np.median([s["pen"] for s in samples])), 3) if samples else "-")
