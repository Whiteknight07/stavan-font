"""Pick words for transcription and render numbered sheets (48 per sheet)."""
import json, os, pickle, random, sys
from common import WORK
from segment import sheet

W = pickle.load(open(f"{WORK}/words.pkl", "rb"))
random.seed(7)
ok = [w for w in W if w["bbox"][3] <= 2.4 * w["u"]]
texty = [w for w in ok if len(w["groups"]) >= 3 and w["bbox"][2] > 2.2 * w["u"]]
short = [w for w in ok if 1 <= len(w["groups"]) <= 2 and w["bbox"][3] >= 0.9 * w["u"]]
pick = random.sample(texty, 5040) + random.sample(short, 1200)
out = f"{WORK}/sheets"
os.makedirs(out, exist_ok=True)
idx = {}
for s in range(0, len(pick), 48):
    n = s // 48
    chunk = pick[s:s + 48]
    sheet(chunk, f"{out}/sheet_{n:03d}.png")
    idx[n] = [w["wid"] for w in chunk]
json.dump(idx, open(f"{out}/index.json", "w"))
print(len(idx), "sheets", len(texty), len(short))
