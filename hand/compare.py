"""Draw a band of a real notes page (vector strokes) for side-by-side comparison."""
import pickle, sys
import cv2
import numpy as np
from common import WORK


def band(file_sub, page, y0, y1, x0=0, x1=None, px=4.0, ink=(120, 35, 25)):
    pages = pickle.load(open(f"{WORK}/strokes.pkl", "rb"))
    p = next(p for p in pages if file_sub in p["file"] and p["page"] == page)
    x1 = x1 or p["w"]
    H, W = int((y1 - y0) * px), int((x1 - x0) * px)
    img = np.full((H, W, 3), (240, 248, 250), np.uint8)
    for s in p["strokes"]:
        q = s["pts"]
        if q[:, 1].max() < y0 or q[:, 1].min() > y1:
            continue
        r = np.round(((q - [x0, y0]) * px) * 8).astype(np.int32)
        cv2.polylines(img, [r.reshape(-1, 1, 2)], False, ink, max(1, int(round(s["width"] * px))), cv2.LINE_AA, 3)
    return img


if __name__ == "__main__":
    f, pg, y0, y1, out = sys.argv[1], int(sys.argv[2]), float(sys.argv[3]), float(sys.argv[4]), sys.argv[5]
    cv2.imwrite(out, band(f, pg, y0, y1))
