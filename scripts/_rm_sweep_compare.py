"""Strength sweep on the wide panorama: which strength actually empties the
room without wrecking architecture?

Kontext guidance is derived from strength (1.5 + strength*2, cap 3.5), so
0.55 -> gc 2.6, 0.7 -> 2.9, 0.85 -> 3.2, 1.0 -> 3.5.
lockDiff/edgeDrift measure drift vs source; for REMOVAL, higher is expected
(more changed) — the question is whether the change is the furniture leaving.
"""
import numpy as np
from PIL import Image

SRC = "scripts/_loft_src.jpg"
RUNS = [
    ("0.55 (current default)", "scripts/_rm_ab_kontext.jpg"),
    ("0.70", "scripts/_rm_s070.jpg"),
    ("0.85", "scripts/_rm_s085.jpg"),
    ("1.00", "scripts/_rm_s100.jpg"),
]

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
src_g = grad(src)
rows = []
for label, path in RUNS:
    out = load(path, size)
    lock = float(np.abs(out - src).mean())
    edge = float(np.abs(grad(out) - src_g).mean())
    rows.append((label, path, lock, edge))
    print(f"strength {label:24s} lockDiff={lock:6.2f}/255  edgeDrift={edge:6.2f}")

figs = "\n".join(
    f'<figure><img src="{p.split("/")[-1]}"><figcaption>strength {lb} — lockDiff {lk:.2f}, edgeDrift {ed:.2f}</figcaption></figure>'
    for lb, p, lk, ed in rows)
html = f"""<!DOCTYPE html><html><head><meta charset="utf-8"><title>Removal strength sweep</title>
<style>body{{background:#111;color:#eee;font-family:sans-serif;margin:0;padding:16px}}
.grid{{display:grid;grid-template-columns:1fr 1fr;gap:12px}}
figure{{margin:0}}img{{width:100%;border-radius:8px;border:1px solid #444}}
figcaption{{font-size:12px;padding:4px 0;color:#aaa}}</style></head><body>
<div class="grid">
<figure><img src="_loft_src.jpg"><figcaption>SOURCE — wide loft panorama</figcaption></figure>
{figs}
</div></body></html>
"""
with open("scripts/_rm_sweep_compare.html", "w", encoding="utf-8") as f:
    f.write(html)
print("wrote scripts/_rm_sweep_compare.html")
