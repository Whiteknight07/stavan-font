"""Find rare characters among unlabelled stroke groups by shape, for Sol to verify in context.

Templates: the writer's own labelled samples when there are any, plus a few handwriting system fonts.
Output: work/verify/vsheet_NNN.png (candidate group in red inside its word), work/verify/index.json {cid: [wid, gi]}
"""
import glob, json, os, pickle, sys
from collections import Counter, defaultdict
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from skimage.morphology import skeletonize
from common import WORK
from harvest import load_labels

N = 28
WANT = list("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!\"#$%&()*+/;<>?@[]^_{|}~")
FONTS = ["/System/Library/Fonts/Supplemental/Bradley Hand Bold.ttf", "/System/Library/Fonts/Noteworthy.ttc",
         "/System/Library/Fonts/Supplemental/Comic Sans MS.ttf", "/System/Library/Fonts/MarkerFelt.ttc",
         "/System/Library/Fonts/Supplemental/Chalkboard.ttc"]


def shape_vec(mask):
    """Thin, fit into an NxN box keeping aspect, blur, L2-normalise."""
    ys, xs = np.nonzero(mask)
    if len(xs) == 0:
        return None
    m = mask[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8)
    h, w = m.shape
    s = (N - 4) / max(h, w)
    m = cv2.resize(m * 255, (max(1, int(w * s)), max(1, int(h * s))), interpolation=cv2.INTER_AREA)
    c = np.zeros((N, N), np.float32)
    oy, ox = (N - m.shape[0]) // 2, (N - m.shape[1]) // 2
    c[oy:oy + m.shape[0], ox:ox + m.shape[1]] = m / 255.0
    c = cv2.GaussianBlur(c, (0, 0), 1.2).ravel()
    return c / (np.linalg.norm(c) + 1e-6)


def stroke_mask(paths, px=40.0):
    a = np.vstack(paths)
    x0, y0 = a.min(0)
    h = max(np.ptp(a[:, 1]), np.ptp(a[:, 0]), 1e-3)
    s = px / h
    W, H = int(np.ptp(a[:, 0]) * s) + 6, int(np.ptp(a[:, 1]) * s) + 6
    img = np.zeros((H, W), np.uint8)
    for p in paths:
        q = np.round(((p - [x0, y0]) * s + 3) * 8).astype(np.int32)
        cv2.polylines(img, [q.reshape(-1, 1, 2)], False, 1, 1, cv2.LINE_8, 3)
    return img


def font_vecs(ch):
    out = []
    for f in FONTS:
        try:
            ft = ImageFont.truetype(f, 80)
        except Exception:
            continue
        im = Image.new("L", (160, 160), 0)
        ImageDraw.Draw(im).text((30, 20), ch, font=ft, fill=255)
        m = np.array(im) > 128
        if m.sum() < 20:
            continue
        v = shape_vec(skeletonize(m))
        if v is not None:
            out.append(v)
    return out


def draw_ctx(w, hi, px_per_u=22, pad=6):
    a = np.vstack(w["strokes"])
    x0, y0 = a[:, 0].min(), a[:, 1].min()
    s = px_per_u / w["u"]
    img = np.full((int(np.ptp(a[:, 1]) * s) + 2 * pad, int(np.ptp(a[:, 0]) * s) + 2 * pad, 3), 255, np.uint8)
    for gi, g in enumerate(w["groups"]):
        col = (0, 0, 230) if gi == hi else (150, 150, 150)
        for k in g:
            q = np.round(((w["strokes"][k] - [x0, y0]) * s + pad) * 8).astype(np.int32)
            cv2.polylines(img, [q.reshape(-1, 1, 2)], False, col, 2, cv2.LINE_AA, 3)
    return img


def vsheet(cells, path, cols=3, cellw=440, cellh=86):
    rows = (len(cells) + cols - 1) // cols
    img = np.full((rows * cellh, cols * cellw, 3), 255, np.uint8)
    for n, (cid, w, gi) in enumerate(cells):
        r, c = divmod(n, cols)
        t = draw_ctx(w, gi)
        f = min(1.0, (cellw - 62) / t.shape[1], (cellh - 6) / t.shape[0])
        if f < 1:
            t = cv2.resize(t, None, fx=f, fy=f, interpolation=cv2.INTER_AREA)
        th, tw = t.shape[:2]
        oy, ox = r * cellh + (cellh - th) // 2, c * cellw + 58
        img[oy:oy + th, ox:ox + tw] = np.minimum(img[oy:oy + th, ox:ox + tw], t)
        cv2.putText(img, str(cid), (c * cellw + 3, r * cellh + 30), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 0, 0), 1)
        cv2.rectangle(img, (c * cellw, r * cellh), ((c + 1) * cellw - 1, (r + 1) * cellh - 1), (210, 210, 210), 1)
    cv2.imwrite(path, img)


if __name__ == "__main__":
    per = int(sys.argv[1]) if len(sys.argv) > 1 else 36
    only = sys.argv[2] if len(sys.argv) > 2 else None          # restrict targets, e.g. "Z"
    seeds = json.loads(sys.argv[3]) if len(sys.argv) > 3 else {}  # {"Z": [[wid, gi], ...]} real examples as templates
    tag = sys.argv[4] if len(sys.argv) > 4 else ""
    words = pickle.load(open(f"{WORK}/words.pkl", "rb"))
    labelled = set(load_labels())
    samples = pickle.load(open(f"{WORK}/samples.pkl", "rb"))
    ranked = pickle.load(open(f"{WORK}/ranked.pkl", "rb"))
    pxh = defaultdict(list)
    for s in samples:
        pxh[s["pid"]].append(s["xh"])
    pxh = {k: float(np.median(v)) for k, v in pxh.items()}
    have = {ch: len(v) for ch, v in ranked.items()}
    targets = list(only) if only else [c for c in WANT if have.get(c, 0) < 15]
    print("targets:", "".join(targets))
    # candidate groups
    keys, vecs, rel = [], [], []
    for w in words:
        if w["wid"] in labelled:
            continue
        xh = pxh.get(w["pid"], 0.75 * w["u"])
        for gi, g in enumerate(w["groups"]):
            paths = [w["strokes"][k] for k in g]
            a = np.vstack(paths)
            h = np.ptp(a[:, 1]) / xh
            if h < 0.15 or h > 2.6 or np.ptp(a[:, 0]) / xh > 1.35 or len(w["groups"]) > 12:
                continue
            v = shape_vec(stroke_mask(paths))
            if v is None:
                continue
            keys.append((w["wid"], gi)); vecs.append(v.astype(np.float16)); rel.append(h)
    V = np.stack(vecs).astype(np.float32)
    rel = np.array(rel)
    print(len(keys), "candidate groups")
    TALL = set("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!?#$%&@()[]{}|/bdfhklt")
    SMALL = set("acemnorsuvwxz")
    wmap = {w["wid"]: w for w in words}
    cells, idx, cid = [], {}, 0
    for ch in targets:
        if ch in seeds:
            wmap0 = {w["wid"]: w for w in words}
            T = [shape_vec(stroke_mask([wmap0[a]["strokes"][k] for k in wmap0[a]["groups"][b]])) for a, b in seeds[ch]]
        else:
            T = [shape_vec(stroke_mask(s["paths"])) for s in ranked.get(ch, [])[:8]] + font_vecs(ch)
        T = [t for t in T if t is not None]
        if not T:
            continue
        sc = (V @ np.stack(T).T).max(1)
        if ch in TALL:
            sc[rel < 1.15] = -1
        if ch in SMALL:
            sc[(rel > 1.3) | (rel < 0.5)] = -1
        if ch in "^~*\"":
            sc[rel > 0.9] = -1
        for i in np.argsort(-sc)[:per]:
            if sc[i] <= 0:
                break
            wid, gi = keys[i]
            idx[f"{tag}{cid}"] = [int(wid), int(gi), ch]
            cells.append((f"{tag}{cid}", wmap[wid], gi)); cid += 1
    out = f"{WORK}/verify"
    os.makedirs(out, exist_ok=True)
    old = json.load(open(f"{out}/index.json")) if (tag and os.path.exists(f"{out}/index.json")) else {}
    if not tag:
        for f in glob.glob(f"{out}/vsheet_*.png"):
            os.remove(f)
    for s in range(0, len(cells), 48):
        vsheet(cells[s:s + 48], f"{out}/vsheet_{tag}{s // 48:03d}.png")
    old.update(idx)
    json.dump(old, open(f"{out}/index.json", "w"))
    print(len(cells), "candidates on", (len(cells) + 47) // 48, "sheets")
