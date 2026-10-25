"""Pull Apple Pencil strokes out of the GoodNotes PDFs.

Each handwritten stroke is a stroked path with round caps; we flatten its
Bezier curves into a polyline (PDF points, y down). Output: work/strokes.pkl
  pages: list of dict(pid, file, page, w, h, strokes=[dict(pts, width, color)])
"""
import glob, os, pickle, sys
import numpy as np
import pymupdf
from common import DATA, WORK


def bez(p0, p1, p2, p3, n):
    t = np.linspace(0, 1, n)[:, None]
    P = [np.array([p.x, p.y]) for p in (p0, p1, p2, p3)]
    return ((1 - t) ** 3) * P[0] + 3 * ((1 - t) ** 2) * t * P[1] + 3 * (1 - t) * t * t * P[2] + t ** 3 * P[3]


def flatten(items):
    pts = []
    for it in items:
        if it[0] == "c":
            p0, p1, p2, p3 = it[1:5]
            L = abs(p3 - p0) + abs(p1 - p0) + abs(p2 - p1) + abs(p3 - p2)
            seg = bez(p0, p1, p2, p3, max(3, int(L * 4)))
        elif it[0] == "l":
            seg = np.array([[it[1].x, it[1].y], [it[2].x, it[2].y]])
        else:
            return None
        if pts and np.allclose(pts[-1][-1], seg[0], atol=0.05):
            seg = seg[1:]
        pts.append(seg)
    return np.vstack(pts) if pts else None


def page_strokes(page):
    out = []
    for d in page.get_drawings():
        if d["type"] != "s" or d.get("lineCap") != (1, 1, 1):
            continue
        w = d.get("width") or 0
        if not (0.2 <= w <= 1.5):
            continue
        kinds = {i[0] for i in d["items"]}
        if "c" not in kinds or not kinds <= {"c", "l"}:
            continue
        if (d.get("stroke_opacity") or 1) < 0.9:   # highlighter
            continue
        p = flatten(d["items"])
        if p is None or len(p) < 2:
            continue
        out.append(dict(pts=p.astype(np.float32), width=float(w), color=tuple(round(c, 2) for c in (d.get("color") or (0, 0, 0)))))
    return out


if __name__ == "__main__":
    files = sorted(f for f in glob.glob(DATA + "/**/*.pdf", recursive=True) if "__MACOSX" not in f)
    pages = []
    for f in files:
        doc = pymupdf.open(f)
        for i, pg in enumerate(doc):
            s = page_strokes(pg)
            if len(s) < 20:
                continue
            pages.append(dict(pid=len(pages), file=os.path.relpath(f, DATA), page=i, w=pg.rect.width, h=pg.rect.height, strokes=s))
    os.makedirs(WORK, exist_ok=True)
    pickle.dump(pages, open(f"{WORK}/strokes.pkl", "wb"))
    print(len(pages), "pages with handwriting,", sum(len(p["strokes"]) for p in pages), "strokes")
