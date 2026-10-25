"""Draw pen centrelines with a round nib (the GoodNotes pen is a round, constant-width pen)."""
import cv2
import numpy as np


def render(paths, shape, radius, scale=1.0, margin=0):
    H, W = shape
    img = np.zeros((int(H * scale) + 2 * margin, int(W * scale) + 2 * margin), np.uint8)
    r = max(1, int(round(radius * scale)))
    for p in paths:
        q = np.round((np.asarray(p) * scale + margin) * 16).astype(np.int32)
        if len(q) == 1:
            cv2.circle(img, tuple(int(v) for v in q[0]), r * 16, 1, -1, cv2.LINE_8, 4)
            continue
        cv2.polylines(img, [q.reshape(-1, 1, 2)], False, 1, 2 * r, cv2.LINE_8, 4)
        cv2.circle(img, tuple(int(v) for v in q[0]), r * 16, 1, -1, cv2.LINE_8, 4)
        cv2.circle(img, tuple(int(v) for v in q[-1]), r * 16, 1, -1, cv2.LINE_8, 4)
    return img
