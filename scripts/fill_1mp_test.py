"""One-off quality verification for the ~1MP Fill Pro change (2026-10-13).

Runs the FULL masked-staging path (Fill Pro call 1 = empty the room, call 2 =
furnish it) on the DEPLOYED worker with a real interior photo, then downloads
the result locally for visual inspection. The output bucket is PRIVATE, so
the bytes are fetched inside a Modal function (which holds IAM creds) and
returned to the local entrypoint. Verifies:
  1. The two masked fill calls succeed end-to-end (no fal size errors).
  2. The stored output is still the uniform 1920x1080 frame.
  3. The staged room looks correct (saved to fill_1mp_after.jpg beside
     fill_1mp_before.jpg for eyeball A/B).

Usage: modal run scripts/fill_1mp_test.py
"""
import base64
import modal
import requests as _requests

SOURCE_URL = (
    "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2"
    "?w=1920&h=1080&fit=crop&q=85"
)

app = modal.App("propreel-fill-mp1-test")

image = modal.Image.debian_slim().pip_install(
    "boto3", "Pillow", "requests", "python-dotenv", "botocore"
)


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("aws-credentials")],
    timeout=120,
)
def upload_mask() -> dict:
    """Mirror the real flow: fetch the source, build a white-on-black brush
    mask over the floor area, upload it to OUR raw bucket (private is fine —
    the worker resolves its own bucket through the S3 API)."""
    import io
    import boto3
    from PIL import Image, ImageDraw

    src = _requests.get(SOURCE_URL, timeout=60)
    src.raise_for_status()
    src_img = Image.open(io.BytesIO(src.content)).convert("L")
    w, h = src_img.size

    # White block over the mid-floor band where furniture typically sits
    mask = Image.new("L", (w, h), 0)
    draw = ImageDraw.Draw(mask)
    bw, bh = int(w * 0.34), int(h * 0.32)
    x0 = (w - bw) // 2
    y0 = int(h * 0.62) - bh // 2
    draw.rectangle([x0, y0, x0 + bw, y0 + bh], fill=255)
    buf = io.BytesIO()
    mask.save(buf, format="PNG")

    bucket = "propreel-raw-assets"
    s3 = boto3.client("s3", region_name="af-south-1")
    key = "tests/fill_1mp_mask.png"
    s3.put_object(Bucket=bucket, Key=key, Body=buf.getvalue(), ContentType="image/png")
    url = f"https://{bucket}.s3.af-south-1.amazonaws.com/{key}"
    return {"mask_url": url, "dims": [w, h]}


@app.function(
    image=image,
    secrets=[modal.Secret.from_name("aws-credentials")],
    timeout=420,
)
def run_staged_edit(mask_url: str) -> dict:
    """Call the deployed edit_image (masked Fill Pro path) and return the
    output bytes fetched through the S3 API (private bucket, IAM creds)."""
    from urllib.parse import urlparse as _ulp
    import boto3
    edit_image = modal.Function.from_name("propreel-render", "edit_image")
    result = edit_image.remote(
        image_url=SOURCE_URL,
        preset_id="luxury_modern",
        mask_url=mask_url,
    )
    print("RESULT:", result)
    out_url = result.get("image_url")
    if not out_url:
        raise RuntimeError(f"no image_url in edit result: {result}")

    parsed = _ulp(out_url)
    bucket = "propreel-video-outputs-sa"
    key = parsed.path.lstrip("/")
    s3 = boto3.client("s3", region_name="af-south-1")
    body = s3.get_object(Bucket=bucket, Key=key)["Body"].read()
    return {"bytes_b64": base64.b64encode(body).decode(), "n": len(body), "url": out_url}


@app.local_entrypoint()
async def main():
    info = upload_mask.remote()
    mask_url = info["mask_url"]
    print(f"source dims {info['dims']}")
    print(f"mask hosted at {mask_url[:80]}")

    out = run_staged_edit.remote(mask_url)
    data = base64.b64decode(out["bytes_b64"])
    print(f"output fetched: {out['n']} bytes")

    from PIL import Image
    import io as _io
    img = Image.open(_io.BytesIO(data))

    src_b = _requests.get(SOURCE_URL, timeout=60).content
    with open("fill_1mp_before.jpg", "wb") as f:
        f.write(src_b)
    with open("fill_1mp_after.jpg", "wb") as f:
        f.write(data)
    print(f"AFTER dims: {img.size[0]}x{img.size[1]}, stored key {out['url'][:90]}…")
    if img.size != (1920, 1080):
        raise SystemExit(f"FAIL: output frame is {img.size}, expected (1920, 1080)")
    print("OK: two masked Fill Pro calls succeeded; frame is 1920x1080")
