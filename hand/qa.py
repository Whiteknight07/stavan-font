"""Review sheets: for each character, 16 candidate variants (spread over the writer's usual shapes).

Sol marks which tiles are clearly that character. Output: work/qa/qa_NNN.png, work/qa/index.json
"""
import glob, json, os, pickle
import cv2
import numpy as np
from common import WORK

TILE, ASC, DESC = 70, 2.5, 1.2   # px per x-height; canvas spans y in [-DESC, ASC]


def tile(paths, n):
    H, W = int((ASC + DESC) * TILE * 0.55), int(2.0 * TILE * 0.55)
    s = TILE * 0.55
    img = np.full((H, W, 3), 255, np.uint8)
    for yy, col in ((0, (90, 90, 230)), (1, (230, 180, 120))):
        r = int((ASC - yy) * s)
        img[r, :] = col
    a = np.vstack(paths)
    w = np.ptp(a[:, 0])
    f = min(1.0, 1.8 / max(w, 1e-3))
    for p in paths:
        q = np.c_[(p[:, 0] * f + 0.1) * s, (ASC - p[:, 1] * f) * s]
        cv2.polylines(img, [np.round(q * 8).astype(np.int32).reshape(-1, 1, 2)], False, (0, 0, 0), 2, cv2.LINE_AA, 3)
    cv2.putText(img, str(n), (2, 13), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (0, 0, 200), 1)
    cv2.rectangle(img, (0, 0), (W - 1, H - 1), (200, 200, 200), 1)
    return img


if __name__ == "__main__":
    ranked = pickle.load(open(f"{WORK}/ranked.pkl", "rb"))
    out = f"{WORK}/qa"
    os.makedirs(out, exist_ok=True)
    for f in glob.glob(f"{out}/qa_*.png"):
        os.remove(f)
    rows, idx = [], {}
    for ch in sorted(ranked):
        ss = ranked[ch]
        top = max(min(len(ss), 16), min(150, int(len(ss) * 0.3)))
        pool = sorted(set(np.linspace(0, top - 1, min(16, top)).astype(int).tolist()))
        r = len(rows)
        idx[r] = [ch, [[ss[i]["wid"], ss[i]["gi"]] for i in pool]]
        tiles = [tile(ss[i]["paths"], n) for n, i in enumerate(pool)]
        label = np.full((tiles[0].shape[0], 150, 3), 255, np.uint8)
        cv2.putText(label, f"row {r}", (4, 30), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 0, 0), 1)
        cv2.putText(label, f"'{ch}'", (20, 85), cv2.FONT_HERSHEY_SIMPLEX, 1.4, (0, 0, 0), 2)
        rows.append(np.hstack([label] + tiles))
    W = max(r.shape[1] for r in rows)
    for s in range(0, len(rows), 8):
        chunk = [np.pad(r, ((0, 4), (0, W - r.shape[1]), (0, 0)), constant_values=255) for r in rows[s:s + 8]]
        cv2.imwrite(f"{out}/qa_{s // 8:03d}.png", np.vstack(chunk))
    json.dump(idx, open(f"{out}/index.json", "w"))
    print(len(rows), "rows on", (len(rows) + 7) // 8, "sheets")
