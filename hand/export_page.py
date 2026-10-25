"""Export one notes page for the "how it was made" story (needs the private work/ files).

site/data/page.json: the page's pen strokes in drawing order, word boxes, letter boxes with the letter
the transcription matched, and which letters ended up in the font. Page 59 (graph theory) is used
because it has no names or ID numbers on it.
"""
import json
import os
import pickle
import sys

import numpy as np

from common import WORK
sys.path.insert(0, os.path.dirname(__file__))
from build_font import _rdp, WEB, DESIGN, NSLOT, glyph_name  # noqa: E402

PAGE = 59
WIDTH = 1000.0


def main():
    words = [w for w in pickle.load(open(f"{WORK}/words.pkl", "rb")) if w["pid"] == PAGE]
    samples = pickle.load(open(f"{WORK}/samples.pkl", "rb"))
    design = json.load(open(os.path.join(DESIGN, "glyphs.json")))
    pts = np.vstack([s for w in words for s in w["strokes"]])
    x0, y0 = pts.min(0)
    x1, y1 = pts.max(0)
    x0, y0, x1, y1 = (float(v) for v in (x0, y0, x1, y1))
    sc = WIDTH / (x1 - x0)
    T = lambda a: np.c_[(a[:, 0] - x0) * sc, (a[:, 1] - y0) * sc]   # y down, like the page
    box = lambda a: [round(float(v), 1) for v in (*a.min(0), *(a.max(0) - a.min(0)))]

    strokes, order, out_words = [], [], []
    for wi, w in enumerate(words):
        groups = []
        for gi, ks in enumerate(w["groups"]):
            g = np.vstack([T(w["strokes"][k]) for k in ks])
            groups.append({"b": box(g)})
        out_words.append({"b": box(np.vstack([T(s) for s in w["strokes"]])), "g": groups})
        for k, s in enumerate(w["strokes"]):
            p = T(s)
            strokes.append([round(float(v), 1) for v in _rdp(p.astype(float), 0.6).ravel()])
            gi = next((g for g, ks in enumerate(w["groups"]) if k in ks), -1)
            order.append((int(w["sidx"][k]) if "sidx" in w else len(order), wi, gi))
    # letters the transcription matched on this page
    wid_index = {w["wid"]: i for i, w in enumerate(words)}
    for s in samples:
        if s["wid"] in wid_index and s.get("text") != "(verified)":
            gr = out_words[wid_index[s["wid"]]]["g"]
            if s["gi"] < len(gr):
                gr[s["gi"]]["c"] = s["ch"]
    # letters picked for the font
    picked = []
    for ch, vs in design.items():
        n = NSLOT if ch.isalnum() else 1
        for i, v in enumerate(vs[:n]):
            if isinstance(v["src"], list) and v["src"][0] in wid_index:
                wi = wid_index[v["src"][0]]
                gi = v["src"][1]
                picked.append({"ch": ch, "w": wi, "g": gi, "glyph": glyph_name(ch) if i == 0 else f"{glyph_name(ch)}.alt{i}"})
    perm = sorted(range(len(strokes)), key=lambda i: order[i][0])
    data = {
        "w": WIDTH, "h": round(float((y1 - y0) * sc), 1),
        "strokes": [strokes[i] for i in perm],
        "strokeWord": [order[i][1] for i in perm],
        "strokeGroup": [order[i][2] for i in perm],
        "words": out_words, "picked": picked,
        "pen": round(float(np.median([wd for w in words for wd in w["widths"]])) * sc, 2),
    }
    json.dump(data, open(os.path.join(WEB, "page.json"), "w"), separators=(",", ":"))
    print(len(strokes), "strokes,", len(out_words), "words,", sum(1 for w in out_words for g in w["g"] if "c" in g),
          "labelled letters, picked:", [p["ch"] for p in picked])


if __name__ == "__main__":
    main()
