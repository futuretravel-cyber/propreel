"""Thin driver for the deployed flashvsr endpoint — 720p + 1080p.

The app is deployed (propreel-flashvsr), so we look the function up by name
and call it REMOTELY. Remote matters: _upscale_one shells out to ffprobe/ffmpeg,
which only exist inside the Modal container, so .local() on a dev box fails.

Prints RESULT_JSON=<json> once per target so the caller can parse results out
of the GPU logs.
"""
import json
import sys

import modal

SRC = ("s3://propreel-video-outputs-sa/"
       "upscaled/src_1V48rFCKbK5fXchXzVdln_6WuVZtAO.mp4")


def main() -> int:
    fn = modal.Function.from_name("propreel-flashvsr", "flashvsr_upscale_video")
    for target in ("720p", "1080p"):
        out = fn.remote(SRC, target, False)
        print("RESULT_JSON=" + json.dumps(out))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
