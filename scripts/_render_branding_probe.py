"""Live essential-tier render probe WITH the new branding payload + music.

Renders 3 test photos with the agent's real branding profile + a music
track, then downloads a few frames from the finished mp4 and reports:
  - branding overlay visible in frame 1 & final frame (bright pixels in the corners)
  - an audio stream actually present (ffprobe)
  - motion: mean |frame diff| between first/last of a segment (zoompan)

Usage: PYTHONUTF8=1 modal run scripts/_render_branding_probe.py
"""
import json
import time
import warnings

warnings.filterwarnings("ignore")
import modal

BUCKET = "propreel-video-outputs-sa"

# The SAME shape the frontend now sends (src/App.tsx generateReel) — pulled
# from the live branding profile so the probe tests the real artwork.  These
# are the platform's own branding objects (profile + logo URLs mirrored from
# the futuretravel agent profile's canonical bucket form).
BRANDING = {
    "photo_url": "https://propreel-raw-assets.s3.af-south-1.amazonaws.com/uploads/usr_1791017880124_jb9eh4lab/1791461121155-7kz4a1.jpg",
    "logo_url": "https://propreel-raw-assets.s3.af-south-1.amazonaws.com/uploads/usr_1791017880124_jb9eh4lab/1791461124477-uldfje.jpg",
    "contact_line": "Ulric van der Merwe · 082 000 0000 · ulric@propreel.co.za",
    "use_avatar": False,
    "use_avatar_url": None,
}
MUSIC = "https://propreel-raw-assets.s3.af-south-1.amazonaws.com/music/placeholder-track.mp3"  # may be absent; render must survive

IMAGES = [
    "https://picsum.photos/id/1015/1920/1080.jpg",
    "https://picsum.photos/id/1016/1920/1080.jpg",
    "https://picsum.photos/id/1018/1920/1080.jpg",
]

app = modal.App("propreel-render-branding-probe")

probe_image = modal.Image.debian_slim().apt_install("ffmpeg", "fonts-dejavu-core").pip_install("boto3", "requests")


@app.function(image=probe_image, secrets=[modal.Secret.from_name("aws-credentials")], timeout=1200)
def check(video_bytes: bytes, record_id: str) -> dict:
    import subprocess as sp
    import tempfile, os
    work = tempfile.mkdtemp(prefix="probe_")
    src = os.path.join(work, "v.mp4")
    with open(src, "wb") as f:
        f.write(video_bytes)

    report = {"record_id": record_id}

    # 1) Audio stream?
    r = sp.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=codec_name,duration",
                "-of", "json", src], capture_output=True, text=True)
    streams = json.loads(r.stdout or "{}").get("streams", [])
    report["audio_streams"] = len(streams)
    report["audio_codec"] = streams[0].get("codec_name") if streams else None
    report["audio_duration"] = streams[0].get("duration") if streams else None

    # 2) Motion: extract frames 0 and N, measure mean abs gray diff
    fu = os.path.join(work, "f1.png")
    fl = os.path.join(work, "f2.png")
    sp.run(["ffmpeg", "-y", "-i", src, "-vf", "select=eq(n\\,0)", "-frames:v", "1", fu], capture_output=True)
    sp.run(["ffmpeg", "-y", "-i", src, "-vf", "select=eq(n\\,72)", "-frames:v", "1", fl], capture_output=True)  # 3s @24fps
    diff = sp.run(["ffmpeg", "-i", fu, "-i", fl, "-filter_complex",
                   "[0]format=gray[a];[1]format=gray[b];[a][b]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
                   "-f", "null", "-"], capture_output=True, text=True)
    import re
    m = re.findall(r"YAVG=([\d.]+)", diff.stderr or "")
    report["mean_abs_frame_diff_0_to_72"] = float(m[0]) if m else None

    # 3) Branding presence: sample title-safe corners of frame 0 and the LAST SECOND.
    # Top-left circle: bright white ring (~255); logo top-right has its own bright pixels;
    # bottom bar: translucent dark + white text raises YAVG vs a bare photo bottom.
    total_frames = None
    r = sp.run(["ffprobe", "-v", "error", "-count_frames", "-select_streams", "v", "-show_entries", "stream=nb_read_frames",
                "-of", "json", src], capture_output=True, text=True)
    try:
        total_frames = int(json.loads(r.stdout or "{}")["streams"][0]["nb_read_frames"])
    except Exception:
        total_frames = 720  # 30s @24fps
    corners = {}
    for label, vf in (("first", "select=eq(n\\,0)"), ("last", f"select=eq(n\\,{max(total_frames-1,1)})")):
        cpath = os.path.join(work, f"c_{label}.png")
        sp.run(["ffmpeg", "-y", "-i", src, "-vf", vf, "-frames:v", "1", cpath], capture_output=True)
        # top-left 240x240 → YMAX (white ring)
        tl = sp.run(["ffmpeg", "-i", cpath, "-vf", "crop=240:240:0:0,signalstats,metadata=print:key=lavfi.signalstats.YMAX",
                     "-f", "null", "-"], capture_output=True, text=True)
        mm = re.findall(r"YMAX=([\d.]+)", tl.stderr or "")
        # top-right 400x200 → YMAX (logo presence)
        tr = sp.run(["ffmpeg", "-i", cpath, "-vf", "crop=400:200:1520:28,signalstats,metadata=print:key=lavfi.signalstats.YMAX",
                     "-f", "null", "-"], capture_output=True, text=True)
        tm = re.findall(r"YMAX=([\d.]+)", tr.stderr or "")
        # bottom 1920x120 → YAVG (translucent contact bar)
        bb = sp.run(["ffmpeg", "-i", cpath, "-vf", "crop=1920:120:0:960,signalstats,metadata=print:key=lavfi.signalstats.YAVG",
                     "-f", "null", "-"], capture_output=True, text=True)
        bm = re.findall(r"YAVG=([\d.]+)", bb.stderr or "")
        corners[label] = {
            "topleft_ymax": float(mm[0]) if mm else None,
            "topright_ymax": float(tm[0]) if tm else None,
            "bottom_bar_yavg": float(bm[0]) if bm else None,
        }
    report["corners"] = corners
    return report


@app.local_entrypoint()
def main():
    import boto3
    f = modal.Function.from_name("propreel-render", "render_video")
    record_id = f"pr_brand_probe_{int(time.time())}"
    t0 = time.time()
    res = f.remote(
        record_id=record_id,
        tier="ESSENTIAL",
        config_index=0,  # 30s / 6 imgs / 5 credits
        orientation="LANDSCAPE",
        images=IMAGES,
        voiceover_text="Welcome to this magnificent family home.",
        voice_id="aletta",
        language="en-ZA",
        include_agent_branding=True,
        music_url=MUSIC,        # may fail → silent but must not break render
        image_prompts=None,
        branding=BRANDING,
        use_avatar=False,
    )
    print(f"render returned in {time.time()-t0:.1f}s:", json.dumps(res, default=str)[:300])

    s3 = boto3.client("s3", region_name="af-south-1")
    vid = s3.get_object(Bucket=BUCKET, Key=f"renders/{record_id}/video.mp4")["Body"].read()
    print("video bytes:", len(vid))
    rep = check.remote(vid, record_id)
    print("REPORT:", json.dumps(rep, indent=2))
