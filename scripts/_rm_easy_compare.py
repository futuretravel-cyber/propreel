"""Easier-photo check: reverted Kontext removal on a single furnished room.

Same metrics as the panorama A/B (lockDiff = mean |delta pixel| vs source,
edgeDrift = gradient-map delta) so the two cases are comparable.
"""
import numpy as np
from PIL import Image

SRC = "scripts/_fc_user.jpg"
B_KONTEXT = "scripts/_rm_easy_kontext.jpg"  # reverted prompt path (today)

def load(p, size=None):
    im = Image.open(p).convert("RGB")
    if size and im.size != size:
        im = im.resize(size)
    return np.asarray(im, dtype=np.float32)

def grad(a):
    g = a.mean(axis=2)
    return np.abs(np.diff(g, axis=0))[:, :-1] + np.abs(np.diff(g, axis=1))[:-1, :]

src = load(SRC)
size = (src.shape[1], src.shape[0])
out = load(B_KONTEXT, size)
lock = float(np.abs(out - src).mean())
edge = float(np.abs(grad(out) - grad(src)).mean())
print(f"source size: {size[0]}x{size[1]}")
print(f"Easy room, Reverted Kontext: lockDiff={lock:.2f}/255  edgeDrift={edge:.2f}")
print(f"(panorama reference: lockDiff=26.52  edgeDrift=7.18)")

html = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>Easy-room removal</title>
<style>body{background:#111;color:#eee;font-family:sans-serif;margin:0;padding:16px}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}
figure{margin:0}img{width:100%;border-radius:8px;border:1px solid #444}
figcaption{font-size:12px;padding:4px 0;color:#aaa}</style></head><body>
<div class="grid">
<figure><img src="_fc_user.jpg"><figcaption>SOURCE — single furnished living room</figcaption></figure>
<figure><img src="_rm_easy_kontext.jpg"><figcaption>Reverted KONTEXT, remove_all_furniture — lockDiff LOCKV, edgeDrift EDGEV</figcaption></figure>
</div></body></html>
"""
html = html.replace("LOCKV", f"{lock:.2f}").replace("EDGEV", f"{edge:.2f}")
with open("scripts/_rm_easy_compare.html", "w", encoding="utf-8") as f:
    f.write(html)
print("wrote scripts/_rm_easy_compare.html")
