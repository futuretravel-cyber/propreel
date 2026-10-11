"""
Strict two-photo structure verdict via the worker's LLM fallback chain.
Uses a small modal function that runs the worker's _llm_chat directly with a
custom verify system prompt (generate_text_fn's persona is fixed to copywriting).

Usage: PYTHONUTF8=1 modal run scripts/_vqa_strict.py
"""
import modal

BUCKET = "propreel-raw-assets"
OUT_BUCKET = "propreel-video-outputs-sa"
SRC_KEY = "uploads/usr_1790936779746_o2qhlegu5/1791617633908-2fayzu.jpg"
PAIRS = [
    ("dev_fill_AB", "edited/_ab/fill_ab_dev_fill.jpg"),
    ("pro_fill_AB", "edited/_ab/fill_ab_pro_fill.jpg"),
]
QUESTIONS = (
    "Q1: Do the two photos show the same room?\\n"
    "Q2: Is the staircase to the mezzanine the same size and position in both?\\n"
    "Q3: Is the kitchen area (counter, cupboards, hood) identical in both?\\n"
    "Q4: Are the brick walls, windows and ceiling beams unchanged between the two?\\n"
    "Q5: Do the photos appear to be rendered from the same camera position and field of view?\\n"
    "Q6: Does PHOTO 2 contain realistic, well-placed furniture (sofas, tables, lamps) with correct perspective and shadows?\\n"
)
SYSTEM = (
    "You verify that an AI photo edit preserved the room structure of the "
    "original. You are shown two photos: PHOTO 1 is the original, PHOTO 2 is "
    "the edit. Answer each question with only YES, NO, or UNSURE followed by "
    "a short reason, one per line, then one final line VERDICT: PASS if photo 2 "
    "is clearly the same room with structure unchanged, or VERDICT: FAIL if "
    "structure was changed or a different room was substituted. Different "
    "lighting or new furniture does not count against structure."
)

app = modal.App("propreel-vqa-strict")

image = modal.Image.debian_slim(python_version="3.11").pip_install(
    "boto3", "botocore", "fal-client"
)

@app.function(
    image=image,
    secrets=[modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")],
    timeout=180,
)
def ask_vqa(src_presigned: str, edited_presigned: str) -> str:
    import sys
    sys.path.insert(0, "/root")
    import base64

    import fal_client

    def enc(url: str) -> str:
        import urllib.request
        data = urllib.request.urlopen(url, timeout=60).read()
        return "data:image/jpeg;base64," + base64.b64encode(data).decode()

    messages = [
        {"role": "system", "content": SYSTEM},
        {"role": "user", "content": [
            {"type": "text", "text": QUESTIONS},
            {"type": "image_url", "image_url": {"url": enc(src_presigned)}},
            {"type": "image_url", "image_url": {"url": enc(edited_presigned)}},
        ]},
    ]
    # try the fal OpenRouter OpenAI-compatible chat endpoint directly
    result = fal_client.run(
        "openrouter/router/openai/v1/chat/completions",
        arguments={"model": "x-ai/grok-4.6", "messages": messages},
    )
    choices = result.get("choices") or []
    return (choices[0].get("message") or {}).get("content", "(no content)")


def presign(bucket: str, key: str) -> str:
    import boto3, botocore.config
    s3 = boto3.client("s3", region_name="af-south-1",
                      config=botocore.config.Config(s3={"addressing_style": "virtual"}))
    return s3.generate_presigned_url(
        "get_object", Params={"Bucket": bucket, "Key": key}, ExpiresIn=7200)


@app.local_entrypoint()
async def main():
    src = presign(BUCKET, SRC_KEY)
    for name, edited_key in PAIRS:
        edited = presign(OUT_BUCKET, edited_key)
        try:
            text = ask_vqa.remote(src, edited)
        except Exception as e:
            text = f"VQA errored: {e}"
        print(f"\n===== {name} =====\n{text}\n")
