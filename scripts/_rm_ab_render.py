"""
A/B: reverted Furniture Removal vs the archived Fill Pro masked baseline.

A (baseline, Oct 10): scripts/_loft_fixed_final.jpg — masked FLUX.1 Fill
    [pro] run from commit 13203c3's verification, on scripts/_loft_src.jpg
    with a painted furniture mask.
B (now): edit_image(preset_id='remove_all_furniture') with NO mask and no
    custom prompt — exactly what the reverted frontend sends. Takes the
    Kontext path and resolves the ORIGINAL full preset prompt from
    modal/image_prompts.py.

Usage: modal run scripts/_rm_ab_render.py
"""
import json
import os
import time
import urllib.request
import boto3
import modal

# Env-overridable so the same script runs the wide-panorama case and the
# easier single-room case without edits.
SRC = os.environ.get("RM_SRC", "scripts/_loft_src.jpg")
OUT_B = os.environ.get("RM_OUT", "scripts/_rm_ab_kontext.jpg")
BUCKET = "propreel-raw-assets"
KEY = os.environ.get("RM_KEY", "uploads/_ab/loft_src_rm_ab.jpg")
# Kontext guidance is DERIVED from strength (1.5 + strength*2, cap 3.5) —
# the worker ignores an explicit guidance_scale on this path — so a strength
# sweep is the only lever. RM_STRENGTH lets each run test one value.
STRENGTH = float(os.environ.get("RM_STRENGTH", "0.55"))

app = modal.App("propreel-rm-ab")
edit_image = modal.Function.from_name("propreel-render", "edit_image")
get_image_presets = modal.Function.from_name("propreel-render", "get_image_presets")


@app.local_entrypoint()
async def main():
    # 0) Prove the DEPLOYED worker resolves the original prompt (not the
    #    deleted condensed masked-removal wording).
    presets = await get_image_presets.remote.aio()
    p = next(x for x in presets if x["id"] == "remove_all_furniture")
    original = "Keep the room's structure exactly as it is in the input photo" in p["prompt"]
    print(f"DEPLOYED_PROMPT_IS_ORIGINAL: {original} (len={len(p['prompt'])})")
    print("PROMPT_HEAD:", p["prompt"][:140])

    # 1) Upload the same source the Fill Pro baseline used, presign a GET.
    #    Pin the regional endpoint: a global-endpoint presign 301-redirects
    #    and fal's downloader refuses the redirect.
    s3 = boto3.client("s3", region_name="af-south-1",
                      endpoint_url="https://s3.af-south-1.amazonaws.com")
    s3.upload_file(SRC, BUCKET, KEY)
    url = s3.generate_presigned_url(
        "get_object", Params={"Bucket": BUCKET, "Key": KEY}, ExpiresIn=3600)
    print(f"presigned input: {KEY}")
    print(f"presigned host: {url.split('/')[2]}")

    # 2) Real render through the reverted path: preset defaults, no mask.
    t0 = time.time()
    res = await edit_image.remote.aio(
        image_url=url,
        preset_id="remove_all_furniture",
        strength=STRENGTH,
        guidance_scale=5.0,
    )
    dt = time.time() - t0
    img_url = res.get("image_url", "")
    print(f"edit_image returned in {dt:.1f}s: {json.dumps({k: res.get(k) for k in ('image_url', 'preset_id', 'strength', 'guidance_scale')})[:300]}")

    # 3) Save the output next to the baseline for the side-by-side.
    urllib.request.urlretrieve(img_url, OUT_B)
    print(f"SAVED: {OUT_B}")
