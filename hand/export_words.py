"""Export real words from the notes for the website (needs the private work/ files).

site/data/words.json:
  words:   [{t: text or "", s: [[x,y,x,y...] per stroke, font units, baseline 0, y up]}]
  sources: {glyph name: [word index, [stroke indices of that letter inside the word]]}
  game:    [word index, ...]  whole words for the "real or font?" game
"""
import json
import os
import pickle
import random
import sys

import numpy as np

from common import WORK
sys.path.insert(0, os.path.dirname(__file__))
from build_font import S, NSLOT, glyph_name, _rdp, WEB, DESIGN  # noqa: E402


# reviewed by eye: mislabelled, cut off or garbled samples that would make the game unfair
GAME_SKIP = {"inde", "were", "line", "lower", "direction", "closer", "into", "right", "null", "addition", "first"}
GAME_DROP = {"recursion", "influence", "stock"}  # second review pass (dropped after shuffling so the rest stay put)


def main():
    words = {w["wid"]: w for w in pickle.load(open(f"{WORK}/words.pkl", "rb"))}
    samples = pickle.load(open(f"{WORK}/samples.pkl", "rb"))
    by_key = {(s["wid"], s["gi"]): s for s in samples}
    design = json.load(open(os.path.join(DESIGN, "glyphs.json")))
    fontchars = set(design)

    out_words, index = [], {}

    def frame(s):
        """Baseline line (m, b) and x-height of the word, recovered from one normalized letter sample."""
        w = words[s["wid"]]
        orig = [w["strokes"][k] for k in w["groups"][s["gi"]]]
        X, Y = [], []
        for o, p in zip(orig, s["paths"]):
            X.append(o[:, 0]); Y.append(p[:, 1] * s["xh"] + o[:, 1])
        X, Y = np.concatenate(X), np.concatenate(Y)
        m, b = np.polyfit(X, Y, 1)
        return m, b, s["xh"]

    def add_word(wid, s, text):
        if wid in index:
            return index[wid]
        w = words[wid]
        m, b, xh = frame(s)
        x0 = min(st[:, 0].min() for st in w["strokes"])
        strokes = []
        for st in w["strokes"]:
            p = np.c_[(st[:, 0] - x0) / xh, (m * st[:, 0] + b - st[:, 1]) / xh] * S
            strokes.append(np.round(_rdp(p, 1.5)).astype(int).ravel().tolist())
        index[wid] = len(out_words)
        out_words.append(dict(t=text, s=strokes))
        return index[wid]

    sources = {}
    for ch, vs in design.items():
        base = glyph_name(ch)
        n = NSLOT if ch.isalnum() else 1
        for i in range(n):
            v = vs[i % len(vs)]
            if not isinstance(v["src"], list):
                continue
            wid, gi = v["src"]
            s = by_key.get((wid, gi))
            if s is None:
                continue
            w = words[wid]
            text = s["text"] if s["text"] != "(verified)" else ""
            wi = add_word(wid, s, text)
            ks = list(w["groups"][gi])
            # i/j dots that were re-attached from a neighbouring group
            for extra in s["paths"][len(ks):]:
                for k, st in enumerate(w["strokes"]):
                    if k not in ks and len(st) == len(extra):
                        ks.append(k)
                        break
            sources[base if i == 0 else f"{base}.alt{i}"] = [wi, ks]

    # game: whole transcribed words, plain letters only, every group matched to a letter
    rng = random.Random(7)
    dictionary = set(open("/usr/share/dict/words").read().lower().split()) if os.path.exists("/usr/share/dict/words") else None
    cands = {}
    for s in samples:
        t = s["text"]
        if (s.get("exact") and s["own_xh"] and t.isalpha() and 4 <= len(t) <= 9 and t.lower() == t
                and set(t) <= fontchars and len(words[s["wid"]]["groups"]) == len(t)
                and (dictionary is None or t in dictionary)):
            cands.setdefault(t, s)
    pool = [t for t in sorted(cands) if t not in GAME_SKIP]
    rng.shuffle(pool)
    game = [add_word(cands[t]["wid"], cands[t], t) for t in pool[:72] if t not in GAME_DROP]

    os.makedirs(WEB, exist_ok=True)
    json.dump(dict(words=out_words, sources=sources, game=game),
              open(os.path.join(WEB, "words.json"), "w"), separators=(",", ":"))
    print(len(out_words), "words,", len(sources), "sourced glyphs,", len(game), "game words")


if __name__ == "__main__":
    main()
