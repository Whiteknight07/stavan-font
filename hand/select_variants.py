"""Rank letter samples by typicality and pick up to 3 distinct variants per character.

Output: work/ranked.pkl {ch: [samples sorted best-first]}, design/picks.json
"""
import json, os, pickle, random
from collections import defaultdict
import cv2
import numpy as np
from common import ROOT, WORK

CASE_PAIRS = set("cosuvwxzkpy")   # capitals that look like big lowercase
X0, X1, Y0, Y1, PX = -0.15, 2.4, -1.1, 2.1, 22   # canvas in x-height units


def bounds(paths):
    a = np.vstack(paths)
    return a[:, 0].min(), a[:, 0].max(), a[:, 1].min(), a[:, 1].max()


def canvas(paths):
    W, H = int((X1 - X0) * PX), int((Y1 - Y0) * PX)
    img = np.zeros((H, W), np.float32)
    for p in paths:
        q = np.c_[(p[:, 0] - X0) * PX, (Y1 - p[:, 1]) * PX]
        cv2.polylines(img, [np.round(q * 8).astype(np.int32).reshape(-1, 1, 2)], False, 1.0, 2, cv2.LINE_AA, 3)
    img = cv2.GaussianBlur(img, (0, 0), 1.4)
    v = img.ravel()
    return v / (np.linalg.norm(v) + 1e-6)


def plausible(s):
    x0, x1, y0, y1 = bounds(s["paths"])
    h, w = y1 - y0, x1 - x0
    ch = s["ch"]
    if w > 3.0 or h > 3.2 or y1 > 2.6 or y0 < -1.6:
        return False
    if ch.isalpha():
        if ch.islower() and ch in "cosuvwxz" and y1 > 1.25:
            return False
        if ch.isupper() and ch.lower() in CASE_PAIRS and y1 < 1.25:
            return False
        if ch in "acemnorsuvwxz" and not (0.6 < y1 < 1.35 and y0 > -0.3):
            return False
        if ch in "bdhklt" and y1 < 1.2:
            return False
        if ch in "gpqy" and y0 > -0.3:
            return False
    if ch.isdigit() and h < 0.8:
        return False
    return True


def load_approved():
    """QA results: {ch: set(pool indices)} from work/qa (index.json + answers_*.txt)."""
    import glob, re
    qdir = f"{WORK}/qa"
    if not os.path.exists(f"{qdir}/index.json"):
        return {}
    idx = json.load(open(f"{qdir}/index.json"))   # row -> [ch, [[wid, gi], ...]]
    out = {}
    for f in glob.glob(f"{qdir}/answers_*.txt"):
        for line in open(f, encoding="utf-8", errors="replace"):
            m = re.match(r"^\s*row\s*(\d+)\s*:\s*([\d\s,]*)$", line.strip(), re.I)
            if not m or m.group(1) not in idx:
                continue
            ch, pool = idx[m.group(1)]
            nums = [int(t) for t in re.findall(r"\d+", m.group(2))]
            out.setdefault(ch, set()).update(tuple(pool[n]) for n in nums if 0 <= n < len(pool))   # empty = all rejected
    return out


def run(max_n=500, k=5):
    samples = pickle.load(open(f"{WORK}/samples.pkl", "rb"))
    approved = load_approved()
    rp = f"{ROOT}/design/reject.json"
    rejected = {(c, w, g) for c, w, g in json.load(open(rp))} if os.path.exists(rp) else set()
    by = defaultdict(list)
    for s in samples:
        if not plausible(s) or (s["ch"], s["wid"], s["gi"]) in rejected:
            continue
        if s["ch"] in "ij" and len(s["paths"]) < 2:     # the writer dots i and j
            continue
        by[s["ch"]].append(s)
    random.seed(0)
    ranked, picks = {}, {}
    for ch, ss in by.items():
        if len(ss) > max_n:
            ss = sorted(ss, key=lambda s: (not s["own_xh"], not s["exact"], random.random()))[:max_n]
        V = np.stack([canvas(s["paths"]) for s in ss])
        if len(ss) >= 3:
            D = 1 - V @ V.T
            np.fill_diagonal(D, np.nan)
            typ = np.nanmedian(D, axis=1)
        else:
            typ = np.full(len(ss), 0.5)
        for s, t in zip(ss, typ):
            s["typ"] = float(t)
            s["rank"] = float(t) + (0 if s["own_xh"] else 0.04) + (0 if s["exact"] else 0.02)
        order = np.argsort([s["rank"] for s in ss])
        ss = [ss[i] for i in order]
        V = V[order]
        ranked[ch] = ss
        # Variety, not neatness: the pool is spread evenly over the writer's usual shapes (top 30% by
        # typicality), and Sol-approved when a QA pass exists. Then: best one first, then the least alike.
        top = max(min(len(ss), 16), min(150, int(len(ss) * 0.3)))
        pool = sorted(set(np.linspace(0, top - 1, min(16, top)).astype(int).tolist()))
        if ch in approved and ch not in "ij":   # i/j were reviewed before their dots were attached
            ok = [i for i in range(len(ss)) if (ss[i]["wid"], ss[i]["gi"]) in approved[ch]]
            if not ok:          # reviewers rejected every sample: leave it to construct.py
                continue
            pool = ok
        chosen, words = [pool[0]], {ss[pool[0]]["wid"]}
        while len(chosen) < k:
            best, bd = None, -1
            for i in pool:
                if i in chosen or ss[i]["wid"] in words:
                    continue
                d = min(1 - V[i] @ V[j] for j in chosen)
                if d < 0.02:
                    continue
                if d > bd:
                    best, bd = i, d
            if best is None:
                break
            chosen.append(best); words.add(ss[best]["wid"])
        picks[ch] = [[ss[i]["wid"], ss[i]["gi"]] for i in chosen]
    pickle.dump(ranked, open(f"{WORK}/ranked.pkl", "wb"))
    pickle.dump({ch: [[s["wid"], s["gi"]] for s in ss] for ch, ss in ranked.items()}, open(f"{WORK}/order.pkl", "wb"))
    os.makedirs(f"{ROOT}/design", exist_ok=True)
    json.dump(picks, open(f"{ROOT}/design/picks.json", "w"), indent=0)
    return ranked, picks


if __name__ == "__main__":
    ranked, picks = run()
    for ch in sorted(ranked):
        print(ch, len(ranked[ch]), " ".join(f"{s['rank']:.2f}" for s in ranked[ch][:4]))
