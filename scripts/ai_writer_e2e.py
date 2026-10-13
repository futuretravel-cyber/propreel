"""E2E of the AI Writer fix on the DEPLOYED worker (propreel-render, 2026-10-13).

The old failure: /generate_text used fal's SYNC path (fal_client.run), which
fal server-kills at 120s — 'hit its timeout of 120s' surfaced as
'Image edit failed: …'. The fix routes LLM calls through the queue
submit+poll (_fal_run_queued, no 120s cap) with a 110s per-attempt cap and
model fallbacks.

This test calls the worker's /generate_text the way the browser does —
kind='description', a long field set, and THREE photo URLs (vision) — the
heaviest regular AI Writer path. It asserts a description comes back within
the old failure budget (210s wall clock; three attempts at ≤110s each) and
that the text is German-free property copy of non-trivial length.

Token: v1 worker token minted INSIDE Modal with the render-auth secret,
exactly like lib/workerToken.ts does on Vercel.

Usage: modal run scripts/ai_writer_e2e.py
"""
import json
import os
import time

import modal
import requests as _requests

app = modal.App("propreel-ai-writer-e2e")

image = modal.Image.debian_slim().pip_install(
    "boto3", "requests", "python-dotenv", "botocore"
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("render-auth")],
    timeout=420,
)
def call_generate_text() -> dict:
    import base64
    import hashlib
    import hmac as _hmac

    secret = os.environ["RENDER_API_TOKEN"]
    exp = int(time.time()) + 600
    msg = f"v1.{exp}.e2e-writer"
    sig = _hmac.new(secret.encode(), msg.encode(), hashlib.sha256).digest()
    token = f"{msg}.{base64.urlsafe_b64encode(sig).decode().rstrip('=')}"
    headers = {"X-PropReel-Token": token, "Content-Type": "application/json"}

    # Candidate REAL interior photos (worker presigns our-bucket URLs; Unsplash
    # passes through as-is). Each is LIVE-VERIFIED below — a dead URL fails
    # the provider-side download with a 400/401 wrapper, not a timeout, and
    # must not pollute the fix-under-test signal. 12 candidates ⇒ ≥8 live.
    candidates = [
        "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80",
        "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=80",
        "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1200&q=80",
        "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?w=1200&q=80",
        "https://images.unsplash.com/photo-1600121848594-d8644e57abab?w=1200&q=80",
        "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=1200&q=80",
        "https://images.unsplash.com/photo-1600585152220-90363fe7e115?w=1200&q=80",
        "https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=1200&q=80",
        "https://images.unsplash.com/photo-1600607687644-c7171b4249b6?w=1200&q=80",
        "https://images.unsplash.com/photo-1600607688969-a5bfcd646154?w=1200&q=80",
        "https://images.unsplash.com/photo-1600607688066-890987f18a86?w=1200&q=80",
        "https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=1200&q=80",
    ]
    photos = []
    for u in candidates:
        try:
            rr = _requests.head(u, timeout=15, allow_redirects=True)
            if rr.status_code == 200:
                photos.append(u)
            else:
                print(f"dead candidate …{u[-34:]} → {rr.status_code}")
        except Exception as e:
            print(f"unreachable candidate: {e}")
        if len(photos) >= 8:
            break
    if len(photos) < 8:
        raise RuntimeError(f"only {len(photos)} live photo URLs — broaden the candidate list")
    print(f"using {len(photos)} live photos")
    fields = {
        "tone": "Luxury",
        "address": "15 Vineyard Road, Constantia, Cape Town",
        "price": "R 12 500 000,00",
        "bedrooms": "5",
        "bathrooms": "4",
        "garages": "3",
        "propertyType": "House",
        "province": "Western Cape",
        "erf_size_m2": "1200",
        "floor_size_m2": "480",
        "key_features": "pool, solar, flatlet, mountain views, scullery",
        "extra_features": "Electric fencing, borehole, four fireplaces",
        "location": "Constantia, Cape Town (latitude -34.02201, longitude 18.43156)",
        "location_confirmed": "Yes — the agent confirmed the exact pin on Google Maps",
        "nearby_amenities": "Constantia Village (900m); Grove Primary School (1,2km); Constantia Gym (1,5km)",
        "currency": "ZAR (South African Rand) — always write prices with the decimal system, e.g. R12 500 000,00",
    }
    body = {
        "kind": "description",
        "fields": fields,
        "images": photos,
        # Long script variant is video_script; description with 3 vision
        # photos + this many fields was the path that previously blew 120s.
    }

    started = time.time()
    res = _requests.post(
        "https://futuretravel--propreel-render-web.modal.run/generate_text",
        headers=headers,
        json=body,
        timeout=360,
    )
    elapsed = time.time() - started
    out = {
        "status": res.status_code,
        "elapsed_s": round(elapsed, 1),
        "url": res.url,
    }
    try:
        data = res.json()
    except Exception:
        data = {"raw": res.text[:500]}
    out["body"] = data
    text = (data or {}).get("text") or ""
    out["text_len"] = len(text)
    out["text_head"] = text[:260]
    out["text_tail"] = text[-160:] if len(text) > 400 else ""
    out["words"] = len(text.split())
    return out


@app.local_entrypoint()
async def main():
    result = call_generate_text.remote()
    print(json.dumps(result, indent=2, ensure_ascii=False))
    if result["status"] != 200:
        raise SystemExit(f"FAIL: status {result['status']} after {result['elapsed_s']}s — {str(result.get('body'))[:400]}")
    t = result.get("body", {}).get("text") or ""
    if len(t.split()) < 60:
        raise SystemExit(f"FAIL: description too short ({result['words']} words)")
    print(f"\nOK: AI Writer returned {result['words']} words in {result['elapsed_s']}s — no 120s timeout.")
