"""Compare reverted-Kontext removal output vs the archived Fill Pro baseline.

Metrics per output, vs the common source:
  - lockDiff: mean |Δpixel| over the image (0-255) — overall drift
  - edge-drift: mean |Δ| on Canny-ish gradient maps — structural movement
    (walls/lines shifting shows up here even when colors average out)
"""
import numpy as np
from PIL import Image

SRC = "scripts/_loft_src.jpg"
# Fill Pro MASKED removal output from commit 13203c3's verification run
# (S3 edited/remove_all_furniture_1791617633908-2fayzu.jpg, Oct 10 10:18 UTC).
A_FILL = "scripts/_rm_ab_fillpro.jpg"
B_KONTEXT = "scripts/_rm_ab_kontext.jpg"   # reverted prompt path (today)

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
rows = []
for name, path in (("Fill Pro masked (Oct 10)", A_FILL), ("Reverted Kontext (today)", B_KONTEXT)):
    out = load(path, size)
    lock = float(np.abs(out - src).mean())
    edge = float(np.abs(grad(out) - grad(src)).mean())
    rows.append((name, lock, edge))

print(f"source size: {size[0]}x{size[1]}")
for name, lock, edge in rows:
    print(f"{name:28s}  lockDiff(mean|Δ|)={lock:6.2f}/255   edgeDrift={edge:6.2f}")

html = """<!DOCTYPE html><html><head><meta charset="utf-8"><title>Removal A/B</title>
<style>body{background:#111;color:#eee;font-family:sans-serif;margin:0;padding:16px}
.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px}
figure{margin:0}img{width:100%;border-radius:8px;border:1px solid #444}
figcaption{font-size:12px;padding:4px 0;color:#aaa}</style></head><body>
<div class="grid">
<figure><img src="_loft_src.jpg"><figcaption>SOURCE — loft panorama (same input for both)</figcaption></figure>
<figure><img src="_rm_ab_fillpro.jpg"><figcaption>A: Fill Pro MASKED (Oct 10 baseline) — lockDiff A_LOCK, edgeDrift A_EDGE</figcaption></figure>
<figure><img src="_rm_ab_kontext.jpg"><figcaption>B: Reverted KONTEXT, original prompts (today) — lockDiff B_LOCK, edgeDrift B_EDGE</figcaption></figure>
</div></body></html>
"""
html = (html.replace("A_LOCK", f"{rows[0][1]:.2f}").replace("A_EDGE", f"{rows[0][2]:.2f}")
        .replace("B_LOCK", f"{rows[1][1]:.2f}").replace("B_EDGE", f"{rows[1][2]:.2f}"))
with open("scripts/_rm_ab_compare.html", "w", encoding="utf-8") as f:
    f.write(html)
print("wrote scripts/_rm_ab_compare.html")
