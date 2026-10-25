"""Group strokes into words and letter groups; draw numbered contact sheets.

Output: work/words.pkl  list of dict(wid, pid, strokes=[pts...], groups=[[stroke idx...]], u)
        work/sheets/sheet_NNN.png  (48 numbered words per sheet, for transcription)
"""
import hashlib, os, pickle, sys
import cv2
import numpy as np
from common import WORK

SC = 4.0   # raster px per pt for grouping


def page_unit(strokes):
    hs = np.array([np.ptp(s["pts"][:, 1]) for s in strokes])
    sel = hs[(hs > 1) & (hs < 40)]
    return float(np.median(sel)) if len(sel) else 8.0


def words_on_page(p):
    S = p["strokes"]
    u = page_unit(S)
    keep = []
    for i, s in enumerate(S):
        w, h = np.ptp(s["pts"][:, 0]), np.ptp(s["pts"][:, 1])
        if w > 5 * u or h > 3.2 * u:      # rules, fraction bars, boxes, plots, big brackets
            continue
        keep.append(i)
    H, W = int(p["h"] * SC) + 4, int(p["w"] * SC) + 4
    m = np.zeros((H, W), np.uint8)
    for i in keep:
        q = np.round(S[i]["pts"] * SC).astype(np.int32)
        cv2.polylines(m, [q.reshape(-1, 1, 2)], False, 1, 2)
    gx, gy = max(3, int(0.8 * u * SC)), max(2, int(0.2 * u * SC))
    d = cv2.dilate(m, cv2.getStructuringElement(cv2.MORPH_RECT, (gx, gy)))
    n, lab = cv2.connectedComponents(d, connectivity=8)
    by = {}
    for i in keep:
        q = np.clip(np.round(S[i]["pts"] * SC).astype(int), 0, [W - 1, H - 1])
        ls = lab[q[:, 1], q[:, 0]]
        ls = ls[ls > 0]
        if len(ls):
            by.setdefault(int(np.bincount(ls).argmax()), []).append(i)
    out = []
    for comp, idx in by.items():
        pts = [S[i]["pts"] for i in idx]
        a = np.vstack(pts)
        bw, bh = np.ptp(a[:, 0]), np.ptp(a[:, 1])
        if bh < 0.5 * u or bw > 30 * u or len(idx) > 40:
            continue
        groups = merge_letters(S, idx)
        out.append(dict(pid=p["pid"], u=u, strokes=pts, sidx=idx, groups=groups,
                        widths=[S[i]["width"] for i in idx], colors=[S[i]["color"] for i in idx],
                        bbox=(a[:, 0].min(), a[:, 1].min(), bw, bh)))
    out.sort(key=lambda w: (round((w["bbox"][1] + w["bbox"][3] / 2) / (2 * u)), w["bbox"][0]))
    return out


def merge_letters(S, idx):
    """Letter candidates: strokes that overlap horizontally (dots, t-bars, multi-stroke letters)."""
    gs = []
    for k, i in enumerate(idx):
        x = S[i]["pts"][:, 0]
        gs.append(dict(x0=x.min(), x1=x.max(), ks=[k]))
    changed = True
    while changed:
        changed = False
        gs.sort(key=lambda g: (g["x0"] + g["x1"]) / 2)
        for a in range(len(gs)):
            for b in range(a + 1, len(gs)):
                A, B = gs[a], gs[b]
                ov = min(A["x1"], B["x1"]) - max(A["x0"], B["x0"])
                if ov >= 0.5 * min(A["x1"] - A["x0"], B["x1"] - B["x0"]) - 0.05:
                    gs[a] = dict(x0=min(A["x0"], B["x0"]), x1=max(A["x1"], B["x1"]), ks=A["ks"] + B["ks"])
                    del gs[b]
                    changed = True
                    break
            if changed:
                break
    gs.sort(key=lambda g: (g["x0"] + g["x1"]) / 2)
    return [sorted(g["ks"]) for g in gs]


def draw_word(w, px_per_u=22, pad=6, color=False):
    a = np.vstack(w["strokes"])
    x0, y0 = a[:, 0].min(), a[:, 1].min()
    s = px_per_u / w["u"]
    Wd, Hd = int(np.ptp(a[:, 0]) * s) + 2 * pad, int(np.ptp(a[:, 1]) * s) + 2 * pad
    img = np.full((Hd, Wd, 3), 255, np.uint8)
    PAL = [(230, 25, 75), (60, 140, 60), (0, 90, 220), (245, 130, 48), (145, 30, 180), (0, 160, 160)]
    for gi, g in enumerate(w["groups"]):
        col = PAL[gi % len(PAL)][::-1] if color else (0, 0, 0)
        for k in g:
            q = np.round(((w["strokes"][k] - [x0, y0]) * s + pad) * 8).astype(np.int32)
            cv2.polylines(img, [q.reshape(-1, 1, 2)], False, col, 2, cv2.LINE_AA, 3)
    return img


def sheet(words, path, cols=3, cellw=440, cellh=86):
    rows = (len(words) + cols - 1) // cols
    img = np.full((rows * cellh, cols * cellw, 3), 255, np.uint8)
    for n, w in enumerate(words):
        r, c = divmod(n, cols)
        t = draw_word(w)
        f = min(1.0, (cellw - 62) / t.shape[1], (cellh - 6) / t.shape[0])
        if f < 1:
            t = cv2.resize(t, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        th, tw = t.shape[:2]
        oy, ox = r * cellh + (cellh - th) // 2, c * cellw + 58
        img[oy:oy + th, ox:ox + tw] = np.minimum(img[oy:oy + th, ox:ox + tw], t)
        cv2.putText(img, str(w["wid"]), (c * cellw + 3, r * cellh + 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 0, 200), 1)
        cv2.rectangle(img, (c * cellw, r * cellh), ((c + 1) * cellw - 1, (r + 1) * cellh - 1), (210, 210, 210), 1)
    cv2.imwrite(path, img)


if __name__ == "__main__":
    pages = pickle.load(open(f"{WORK}/strokes.pkl", "rb"))
    seen, words = set(), []
    for p in pages:
        key = hashlib.md5(b"".join(s["pts"][:3].tobytes() for s in p["strokes"][:60])).hexdigest()
        if key in seen:
            continue
        seen.add(key)
        words += words_on_page(p)
    for i, w in enumerate(words):
        w["wid"] = i
    pickle.dump(words, open(f"{WORK}/words.pkl", "wb"))
    print(len(words), "words;", sum(len(w["groups"]) for w in words), "letter groups")
