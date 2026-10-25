"""Every glyph and all its variants from design/glyphs.json, with baseline (red) and x-height (blue)."""
import json, sys
import cv2
import numpy as np
from common import ROOT
from qa import tile

g = json.load(open(f"{ROOT}/design/glyphs.json"))
chars = sys.argv[2] if len(sys.argv) > 2 else "".join(g)
rows = []
for ch in chars:
    if ch not in g:
        continue
    tiles = [tile([np.array(p) for p in v["paths"]], i) for i, v in enumerate(g[ch])]
    lab = np.full((tiles[0].shape[0], 60, 3), 255, np.uint8)
    cv2.putText(lab, ch if ch.isascii() else "?", (10, 60), cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 0, 0), 2)
    rows.append(np.hstack([lab] + tiles))
W = max(r.shape[1] for r in rows)
rows = [np.pad(r, ((0, 3), (0, W - r.shape[1]), (0, 0)), constant_values=255) for r in rows]
half = (len(rows) + 1) // 2
L, R = np.vstack(rows[:half]), np.vstack(rows[half:])
R = np.pad(R, ((0, L.shape[0] - R.shape[0]), (0, 0), (0, 0)), constant_values=255)
cv2.imwrite(sys.argv[1], np.hstack([L, np.full((L.shape[0], 20, 3), 255, np.uint8), R]))
