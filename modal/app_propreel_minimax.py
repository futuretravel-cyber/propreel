"""
PropReel Modal Backend - Video & Image Rendering Service (Updated)

This Modal app handles:
1. Video rendering using fal-ai/minimax/hailuo-02 with rotating prompts
2. Image editing using fal-ai with comprehensive prompt library
3. FlashHead lip-sync video generation
4. HTTP API endpoints via FastAPI
"""

import modal
import os
import json
import requests
from pathlib import Path
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
import fal_client

# Define the Modal app
app = modal.App("propreel-render")

# Define FastAPI web app
web_app = FastAPI(title="PropReel Render API", version="2.1.0")

# Add CORS middleware
from fastapi.middleware.cors import CORSMiddleware

web_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (configure for production)
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Define the image with required dependencies
image = modal.Image.debian_slim().apt_install(
    "ffmpeg"
).pip_install(
    "boto3",
    "moviepy",
    "Pillow",
    "requests",
    "python-dotenv",
    "fal-client",
    "fastapi",
    "pydantic"
).add_local_file("image_prompts.py", remote_path="/root/image_prompts.py")

# S3 configuration
S3_BUCKET = os.environ.get("AWS_S3_OUTPUT_BUCKET", "propreel-video-outputs-sa")
S3_REGION = os.environ.get("AWS_REGION", "af-south-1")

# Credit cost per image render
IMAGE_RENDER_CREDIT_COST = 2

# Pydantic models for API requests/responses
class RenderVideoRequest(BaseModel):
    record_id: str
    tier: str
    config_index: int
    orientation: str
    images: List[str]
    voiceover_text: str
    voice_id: str = "Joanna"
    include_agent_branding: bool = True
    music_url: Optional[str] = None
    image_prompts: Optional[List[dict]] = None  # [{image_url, prompt_id, prompt}] rotation overrides
    audio: bool = False

class FlashHeadRequest(BaseModel):
    profile_image_url: str
    voiceover_text: str
    user_id: str
    voice: str = "Aria"
    stability: float = 0.5

class EditImageRequest(BaseModel):
    image_url: str
    preset_id: str
    custom_prompt: Optional[str] = None
    strength: Optional[float] = None
    guidance_scale: Optional[float] = None

# Video prompts (rotating A, B, C)
VIDEO_PROMPTS = {
    'A': """Cinematic UE5 visualization of a luxury interior. Source image acts as an unalterable, frozen 3D digital architectural asset and absolute spatial sandbox. Absolute coordinate lock: every pixel, object, fixture, wall, and texture from the source image must remain strictly stationary in its exact original placement. All animation is executed exclusively as an internal digital crop-shift and bounded perspective adjustment—absolutely zero spatial expansion beyond the original frame. Execute a dynamic right-to-left internal lateral sweep combined with a dramatic focal push-in, contained entirely within the source pixels. Hyper-polished Unreal Engine 5.5 Path Traced render, global illumination, 8K resolution, glossy Architectural Digest aesthetic, intense depth of field, cinematic real estate commercial style. Ultra-crisp architectural photography, perfect rectilinear perspective, perfectly straight vertical lines. Lighting features hyper-realistic Ray-Traced reflections, soft ambient occlusion, clean bounce light, and immaculate specular highlights on high-end materials. Absolute pixel-lock on all existing inventory. Zero hallucination, zero alteration, zero border-crossing. Motion must be fluid, smooth, and high-production-value. No adding, removing, replacing, or modifying a single object, wall, furniture piece, appliance, texture, decoration, or architectural element. No creating new rooms, exiting through walls, passing image boundaries, revealing exterior spaces, or border-crossing. No geometry morphing, mutating, warping, melting, bending, slanted walls, curved vertical lines, fisheye lens, or extreme lens distortion. No flickering, flashing, jittery/shaky camera, fast/stuttering motion, low resolution, blur, out-of-focus elements, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures, or unrealistic reflections. No text, watermarks, logos, people, humans, animals, clutter, or dirty surfaces.""",
    
    'B': """Cinematic UE5 visualization of a luxury interior. Source image acts as an unalterable, frozen 3D digital architectural asset and absolute spatial sandbox. Absolute coordinate lock: every pixel, object, fixture, wall, and texture from the source image must remain strictly stationary in its exact original placement. All animation is executed exclusively as an internal digital crop-shift and bounded perspective adjustment—absolutely zero spatial expansion beyond the original frame. Execute a dynamic left-to-right cinematic tracking arc with a sharp focal zoom, strictly maintaining original edges. Hyper-polished Unreal Engine 5.5 Path Traced render, global illumination, 8K resolution, glossy Architectural Digest aesthetic, intense depth of field, cinematic real estate commercial style. Ultra-crisp architectural photography, perfect rectilinear perspective, perfectly straight vertical lines. Lighting features hyper-realistic Ray-Traced reflections, soft ambient occlusion, clean bounce light, and immaculate specular highlights on high-end materials. Absolute pixel-lock on all existing inventory. Zero hallucination, zero alteration, zero border-crossing. Motion must be fluid, smooth, and high-production-value. No adding, removing, replacing, or modifying a single object, wall, furniture piece, appliance, texture, decoration, or architectural element. No creating new rooms, exiting through walls, passing image boundaries, revealing exterior spaces, or border-crossing. No geometry morphing, mutating, warping, melting, bending, slanted walls, curved vertical lines, fisheye lens, or extreme lens distortion. No flickering, flashing, jittery/shaky camera, fast/stuttering motion, low resolution, blur, out-of-focus elements, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures, or unrealistic reflections. No text, watermarks, logos, people, humans, animals, clutter, or dirty surfaces.""",
    
    'C': """Cinematic UE5 visualization of a luxury interior. Source image acts as an unalterable, frozen 3D digital architectural asset and absolute spatial sandbox. Absolute coordinate lock: every pixel, object, fixture, wall, and texture from the source image must remain strictly stationary in its exact original placement. All animation is executed exclusively as an internal digital crop-shift and bounded perspective adjustment—absolutely zero spatial expansion beyond the original frame. Execute a high-impact, dramatic center push-in with a tight inward zoom, locked to the central focal point. Hyper-polished Unreal Engine 5.5 Path Traced render, global illumination, 8K resolution, glossy Architectural Digest aesthetic, intense depth of field, cinematic real estate commercial style. Ultra-crisp architectural photography, perfect rectilinear perspective, perfectly straight vertical lines. Lighting features hyper-realistic Ray-Traced reflections, soft ambient occlusion, clean bounce light, and immaculate specular highlights on high-end materials. Absolute pixel-lock on all existing inventory. Zero hallucination, zero alteration, zero border-crossing. Motion must be fluid, smooth, and high-production-value. No adding, removing, replacing, or modifying a single object, wall, furniture piece, appliance, texture, decoration, or architectural element. No creating new rooms, exiting through walls, passing image boundaries, revealing exterior spaces, or border-crossing. No geometry morphing, mutating, warping, melting, bending, slanted walls, curved vertical lines, fisheye lens, or extreme lens distortion. No flickering, flashing, jittery/shaky camera, fast/stuttering motion, low resolution, blur, out-of-focus elements, grain, noise, overexposure, underexposure, harsh shadows, unnatural lighting, plastic textures, or unrealistic reflections. No text, watermarks, logos, people, humans, animals, clutter, or dirty surfaces."""
}

def get_prompt_for_image(image_index: int, image_url: str | None = None) -> str:
    """Get the prompt for an image: frontend-supplied rotation override first,
    then the built-in A/B/C round-robin (image_index % 3)."""
    overrides = globals().get("PROMPT_OVERRIDES") or {}
    if image_url and image_url in overrides:
        return overrides[image_url]
    prompt_keys = ['A', 'B', 'C']
    prompt_key = prompt_keys[image_index % 3]
    return VIDEO_PROMPTS[prompt_key]


# Populated by /render_video from the request's image_prompts payload
PROMPT_OVERRIDES: dict = {}


def _write_job_status(record_id: str, status: str, extra: dict | None = None):
    """Persist job status to S3 so any worker container can serve /render_status."""
    import boto3, json as _json
    try:
        s3 = boto3.client('s3', region_name=S3_REGION)
        body = _json.dumps({"record_id": record_id, "status": status, "updatedAt": __import__('datetime').datetime.utcnow().isoformat(), **(extra or {})})
        s3.put_object(Bucket=S3_BUCKET, Key=f"jobs/{record_id}.json", Body=body, ContentType='application/json')
    except Exception as e:
        print(f"Job status write failed (non-fatal): {e}")


def _read_job_status(record_id: str):
    import boto3, json as _json
    try:
        s3 = boto3.client('s3', region_name=S3_REGION)
        obj = s3.get_object(Bucket=S3_BUCKET, Key=f"jobs/{record_id}.json")
        return _json.loads(obj['Body'].read())
    except Exception:
        return None

# Tier configurations
TIER_CONFIGS = {
    "ESSENTIAL": {
        "processing_type": "local",
        "resolution": "1080p",
        "configurations": [
            {"duration": 30, "images": 6, "credits": 5},
            {"duration": 60, "images": 12, "credits": 10}
        ]
    },
    "SOCIAL": {
        "processing_type": "ai",
        "resolution": "512p",
        "configurations": [
            {"duration": 30, "images": 5, "credits": 30},
            {"duration": 50, "images": 10, "credits": 50},
            {"duration": 90, "images": 15, "credits": 80}
        ]
    },
    "CINEMATIC": {
        "processing_type": "ai",
        "resolution": "768p",  # Changed from 720p to match fal.ai API (expects 512P or 768P)
        "configurations": [
            {"duration": 30, "images": 5, "credits": 40},
            {"duration": 60, "images": 10, "credits": 70},
            {"duration": 90, "images": 15, "credits": 90}
        ]
    },
    "PREMIUM": {
        "processing_type": "ai_upscaled",
        "resolution": "768p",  # Changed from 720p to match fal.ai API (expects 512P or 768P)
        "configurations": [
            {"duration": 30, "images": 5, "credits": 60},
            {"duration": 60, "images": 10, "credits": 100},
            {"duration": 90, "images": 15, "credits": 150}
        ]
    }
}

@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=600, retries=2, min_containers=0, max_containers=200, scaledown_window=300)
def generate_ai_video_clip(
    image_url: str,
    prompt: str,
    resolution: str,
    duration: int = 6
) -> str:
    """
    Generate a 6-second AI video clip using fal-ai/minimax/hailuo-02
    
    Args:
        image_url: URL of the source image
        prompt: Video generation prompt (max 2000 chars)
        resolution: Target resolution (512p or 720p)
        duration: Duration in seconds (default 6)
    
    Returns:
        URL of the generated video clip
    """
    import fal_client
    
    # Truncate prompt to 2000 characters if needed
    if len(prompt) > 2000:
        prompt = prompt[:2000]
    
    print(f"Generating AI video clip: {resolution}, {duration}s")
    
    # Convert resolution to uppercase (fal.ai expects "512P" or "768P")
    resolution_upper = resolution.upper()
    
    # Use fal_client.submit() for long-running tasks with polling
    handler = fal_client.submit(
        "fal-ai/minimax/hailuo-02/standard/image-to-video",
        arguments={
            "image_url": image_url,
            "prompt": prompt,
            "num_frames": duration * 24,  # 24 fps
            "resolution": resolution_upper,
            "audio": False  # Audio OFF as requested
        }
    )
    
    # Poll for completion with timeout
    import time
    max_wait = 540  # 9 minutes (leave 1 minute buffer before 10 minute timeout)
    start_time = time.time()
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait:
            raise Exception(f"Timeout: fal.ai task did not complete within {max_wait}s")
        
        status = handler.status()  # Returns status object (Queued, InProgress, Completed, Failed)
        status_type = type(status).__name__  # Get the class name
        
        if status_type == "Completed":
            result = handler.get()
            video_url = result.get("video", {}).get("url")
            if not video_url:
                raise Exception("Failed to generate video clip")
            print(f"Generated video clip: {video_url}")
            return video_url
        elif status_type == "Failed":
            raise Exception(f"fal.ai task failed: {status.error}")
        elif status_type in ["Queued", "InProgress"]:
            print(f"fal.ai task {status_type}... ({int(elapsed)}s elapsed)")
            time.sleep(5)  # Poll every 5 seconds
        else:
            raise Exception(f"Unknown fal.ai status: {status_type}")


@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials")], timeout=600, retries=2)
def upscale_video(input_video_url: str, target_resolution: str = "1080p") -> str:
    """
    Upscale video from 720p to 1080p using FFmpeg
    
    Args:
        input_video_url: URL of the 720p video
        target_resolution: Target resolution (default 1080p)
    
    Returns:
        URL of the upscaled video
    """
    import boto3
    import subprocess
    
    print(f"Upscaling video to {target_resolution}")
    
    # Download video
    response = requests.get(input_video_url)
    input_path = "/tmp/input_video.mp4"
    with open(input_path, 'wb') as f:
        f.write(response.content)
    
    # Upscale using FFmpeg
    output_path = "/tmp/upscaled_video.mp4"
    
    if target_resolution == "1080p":
        scale_filter = "scale=1920:1080:flags=lanczos"
    else:
        scale_filter = "scale=1280:720:flags=lanczos"
    
    subprocess.run([
        "ffmpeg", "-i", input_path,
        "-vf", scale_filter,
        "-c:v", "libx264",
        "-preset", "slow",
        "-crf", "18",
        "-c:a", "copy",
        "-y",
        output_path
    ], check=True)
    
    # Upload to S3
    s3 = boto3.client('s3', region_name=S3_REGION)
    s3_key = f"upscaled/{os.path.basename(input_video_url)}"
    
    s3.upload_file(
        output_path,
        S3_BUCKET,
        s3_key,
        ExtraArgs={'ContentType': 'video/mp4', 'ACL': 'public-read'}
    )
    
    video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    print(f"Upscaled video: {video_url}")
    
    return video_url


@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials")], timeout=600, retries=2)
def render_video_local(
    record_id: str,
    images: list[str],
    duration: int,
    orientation: str
) -> str:
    """
    Render video using local FFmpeg (for ESSENTIAL tier)
    
    Args:
        record_id: Unique identifier for this render job
        images: List of image URLs
        duration: Total video duration in seconds
        orientation: Video orientation (LANDSCAPE or PORTRAIT)
    
    Returns:
        URL of the rendered video
    """
    import boto3
    from moviepy import ImageClip, concatenate_videoclips
    from moviepy.video.fx import Resize
    from PIL import Image
    from io import BytesIO
    
    print(f"Rendering local video: {record_id}, {duration}s, {orientation}")
    
    # Set video dimensions
    if orientation == "PORTRAIT":
        width, height = 1080, 1920
    else:
        width, height = 1920, 1080
    
    # Download and process images
    clips = []
    image_duration = duration / len(images)
    
    for i, image_url in enumerate(images):
        print(f"Processing image {i+1}/{len(images)}")
        
        # Download image
        response = requests.get(image_url)
        img = Image.open(BytesIO(response.content))
        
        # Resize and crop
        img = img.resize((width, height), Image.Resampling.LANCZOS)
        
        # Save to temporary file
        temp_path = f"/tmp/{record_id}_img_{i}.jpg"
        img.save(temp_path, quality=95)
        
        # Create video clip with zoom/pan effect
        clip = ImageClip(temp_path, duration=image_duration)
        
        # Add zoom/pan effect using moviepy 2.x API
        clip = clip.with_effects([Resize(lambda t: 1 + 0.1 * t / image_duration)])
        
        clips.append(clip)
    
    # Concatenate clips
    final_video = concatenate_videoclips(clips, method="compose")
    
    # Export video
    output_path = f"/tmp/{record_id}_output.mp4"
    final_video.write_videofile(
        output_path,
        fps=24,
        codec='libx264',
        audio=False
    )
    
    # Upload to S3
    s3 = boto3.client('s3', region_name=S3_REGION)
    s3_key = f"renders/{record_id}/video.mp4"
    
    s3.upload_file(
        output_path,
        S3_BUCKET,
        s3_key,
        ExtraArgs={'ContentType': 'video/mp4', 'ACL': 'public-read'}
    )
    
    video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    print(f"Local render complete: {video_url}")
    
    return video_url


@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=900, retries=2, min_containers=0, max_containers=100, scaledown_window=300)
def render_video(
    record_id: str,
    tier: str,
    config_index: int,
    orientation: str,
    images: list[str],
    voiceover_text: str,
    voice_id: str = "Joanna",
    include_agent_branding: bool = True,
    music_url: str | None = None,
    image_prompts: list[dict] | None = None
) -> dict:
    """
    Render a property video based on the provided parameters.
    
    Args:
        record_id: Unique identifier for this render job
        tier: Video tier (ESSENTIAL, SOCIAL, CINEMATIC, PREMIUM)
        config_index: Index of the configuration to use
        orientation: Video orientation (LANDSCAPE or PORTRAIT)
        images: List of image URLs to include in the video
        voiceover_text: Text for the voiceover narration
        voice_id: Voice identifier for TTS (default: Joanna)
        include_agent_branding: Whether to include agent branding
        music_url: Optional background music URL
    
    Returns:
        Dictionary with video URL and metadata
    """
    import boto3
    
    print(f"Starting render job: {record_id}")
    print(f"Tier: {tier}, Config: {config_index}, Orientation: {orientation}")
    print(f"Images: {len(images)}, Voice: {voice_id}")
    
    # Get tier configuration
    tier_config = TIER_CONFIGS.get(tier, TIER_CONFIGS["SOCIAL"])
    config = tier_config["configurations"][config_index]
    processing_type = tier_config["processing_type"]
    resolution = tier_config["resolution"]
    
    print(f"Processing type: {processing_type}, Resolution: {resolution}")
    print(f"Duration: {config['duration']}s, Images: {config['images']}, Credits: {config['credits']}")
    
    # Limit images to configuration
    images = images[:config['images']]
    
    _write_job_status(record_id, "processing", {"tier": tier, "progress": 0})

    if processing_type == "local":
        # ESSENTIAL tier: Local FFmpeg render
        video_url = render_video_local.remote(
            record_id=record_id,
            images=images,
            duration=config['duration'],
            orientation=orientation
        )
    else:
        # SOCIAL, CINEMATIC, PREMIUM tiers: AI rendering
        video_clips = []
        
        for i, image_url in enumerate(images):
            print(f"Generating AI clip {i+1}/{len(images)}")
            
            # Per-image prompt: frontend rotation payload (A/B/C) if provided,
            # otherwise the built-in round-robin (i % 3)
            supplied = None
            if image_prompts:
                match = next((p for p in image_prompts if p.get("image_url") == image_url and p.get("prompt")), None)
                supplied = match.get("prompt") if match else None
            prompt = supplied or get_prompt_for_image(i)
            _write_job_status(record_id, "processing", {"tier": tier, "progress": round(i / max(1, len(images)) * 100), "clip": i + 1, "clips": len(images), "prompt_id": (match or {}).get("prompt_id") if match else ['A','B','C'][i % 3]})
            
            # Determine base resolution for AI generation
            if processing_type == "ai_upscaled":
                # PREMIUM: Generate at 768p, upscale to 1080p
                ai_resolution = "768p"
            else:
                # SOCIAL/CINEMATIC: Use tier resolution
                ai_resolution = resolution
            
            # Generate 6-second AI video clip
            clip_url = generate_ai_video_clip.remote(
                image_url=image_url,
                prompt=prompt,
                resolution=ai_resolution,
                duration=6
            )
            
            video_clips.append(clip_url)
        
        # Concatenate video clips
        print("Concatenating video clips...")
        # Note: In production, you'd use FFmpeg or moviepy to concatenate
        # For now, we'll use the first clip as placeholder
        video_url = video_clips[0] if video_clips else ""
        
        # Upscale if PREMIUM tier
        if processing_type == "ai_upscaled":
            print("Upscaling to 1080p...")
            video_url = upscale_video.remote(
                input_video_url=video_url,
                target_resolution="1080p"
            )
    
    # Add voiceover and music (placeholder)
    # In production, you'd use moviepy to add audio tracks
    
    print(f"✅ Render complete: {video_url}")
    _write_job_status(record_id, "completed", {"video_url": video_url, "progress": 100})
    
    return {
        "record_id": record_id,
        "status": "completed",
        "video_url": video_url,
        "tier": tier,
        "config_index": config_index,
        "duration": config['duration'],
        "resolution": resolution,
        "processing_type": processing_type,
        "credits_used": config['credits'],
        "image_count": len(images)
    }


# ═══════════════════════════════════════════════════════════════════════════
# Failure path: mark job failed for polling clients (called via .spawn wrapper)
def render_video_failed(record_id: str, error: str):
    _write_job_status(record_id, "failed", {"error": error[:400]})


# # IMAGE EDITING FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════

@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=300, retries=2)
def edit_image(
    image_url: str,
    preset_id: str,
    custom_prompt: str | None = None,
    strength: float | None = None,
    guidance_scale: float | None = None
) -> dict:
    """
    Edit an image using fal-ai with comprehensive prompt library
    
    Args:
        image_url: URL of the source image
        preset_id: ID of the preset to use (e.g., 'golden_sunset', 'luxury_modern')
        custom_prompt: Optional custom prompt (overrides preset)
        strength: Optional strength override (uses preset default if not provided)
        guidance_scale: Optional guidance scale override (uses preset default if not provided)
    
    Returns:
        Dictionary with edited image URL and metadata
    """
    import boto3
    import fal_client
    
    print(f"Editing image: {preset_id}")
    
    # Get preset from library
    import sys
    sys.path.insert(0, '/root')
    from image_prompts import IMAGE_PRESETS
    preset = next((p for p in IMAGE_PRESETS if p['id'] == preset_id), None)
    
    if not preset:
        raise Exception(f"Preset not found: {preset_id}")
    
    # Use custom prompt if provided, otherwise use preset prompt
    prompt = custom_prompt if custom_prompt else preset['prompt']
    negative_prompt = preset['negative_prompt']
    
    # Use provided strength/guidance or preset defaults
    actual_strength = strength if strength is not None else preset['strength']['default']
    actual_guidance = guidance_scale if guidance_scale is not None else preset['guidanceScale']['default']
    
    print(f"Using strength: {actual_strength}, guidance: {actual_guidance}")
    
    # Use fal_client.submit() for long-running tasks with polling
    handler = fal_client.submit(
        "fal-ai/flux/dev/image-to-image",
        arguments={
            "image_url": image_url,
            "prompt": prompt,
            "negative_prompt": negative_prompt,
            "strength": actual_strength,
            "guidance_scale": actual_guidance,
            "num_inference_steps": 50,
            "enable_safety_checker": False
        }
    )
    
    # Poll for completion with timeout
    import time
    max_wait = 240  # 4 minutes (leave 1 minute buffer before 5 minute timeout)
    start_time = time.time()
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait:
            raise Exception(f"Timeout: fal.ai image edit task did not complete within {max_wait}s")
        
        status = handler.status()  # Returns status object (Queued, InProgress, Completed, Failed)
        status_type = type(status).__name__  # Get the class name
        
        if status_type == "Completed":
            result = handler.get()
            edited_image_url = result.get("images", [{}])[0].get("url")
            if not edited_image_url:
                raise Exception("Failed to generate edited image")
            break
        elif status_type == "Failed":
            raise Exception(f"fal.ai image edit task failed: {status.error}")
        elif status_type in ["Queued", "InProgress"]:
            print(f"fal.ai image edit task {status_type}... ({int(elapsed)}s elapsed)")
            time.sleep(3)  # Poll every 3 seconds (faster for images)
        else:
            raise Exception(f"Unknown fal.ai status: {status_type}")
    
    # Download and upload to S3
    response = requests.get(edited_image_url)
    
    s3 = boto3.client('s3', region_name=S3_REGION)
    s3_key = f"edited/{preset_id}_{os.path.basename(image_url)}"
    
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=s3_key,
        Body=response.content,
        ContentType='image/jpeg',
        ACL='public-read'
    )
    
    final_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    
    print(f"✅ Image edit complete: {final_url}")
    
    return {
        "status": "completed",
        "image_url": final_url,
        "preset_id": preset_id,
        "strength": actual_strength,
        "guidance_scale": actual_guidance,
        "credits_used": IMAGE_RENDER_CREDIT_COST
    }


@app.function(image=image)
def get_image_presets() -> list:
    """
    Get all available image editing presets
    
    Returns:
        List of preset dictionaries
    """
    import sys
    sys.path.insert(0, '/root')
    from image_prompts import IMAGE_PRESETS
    return IMAGE_PRESETS


@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials"), modal.Secret.from_name("fal-credentials")], timeout=300, retries=2)
def generate_flashhead_video(
    profile_image_url: str,
    voiceover_text: str,
    user_id: str,
    voice: str = "Aria",
    stability: float = 0.5
) -> dict:
    """
    Generate a lip-synced video using fal-ai/flashhead
    
    Args:
        profile_image_url: URL of the agent's profile image (portrait recommended)
        voiceover_text: Text to speak (converted to speech via ElevenLabs)
        user_id: User identifier for S3 storage
        voice: ElevenLabs voice name (default: Aria)
               Options: Aria, Roger, Sarah, Laura, Charlie, George, Callum, 
                       River, Liam, Charlotte, Alice, Matilda, Will, Jessica, 
                       Eric, Chris, Brian, Daniel, Lily, Bill
        stability: Voice stability 0-1 (default: 0.5)
    
    Returns:
        Dictionary with video URL and metadata
    """
    import boto3
    import fal_client
    
    print(f"Generating FlashHead video for user: {user_id}")
    print(f"Voice: {voice}, Text length: {len(voiceover_text)} characters")
    
    # Use fal_client.submit() for long-running tasks with polling
    handler = fal_client.submit(
        "fal-ai/flashhead",
        arguments={
            "image_url": profile_image_url,
            "text": voiceover_text,
            "voice": voice,
            "stability": stability
        }
    )
    
    # Poll for completion with timeout
    import time
    max_wait = 240  # 4 minutes (leave 1 minute buffer before 5 minute timeout)
    start_time = time.time()
    
    while True:
        elapsed = time.time() - start_time
        if elapsed > max_wait:
            raise Exception(f"Timeout: fal.ai FlashHead task did not complete within {max_wait}s")
        
        status = handler.status()  # Returns status object (Queued, InProgress, Completed, Failed)
        status_type = type(status).__name__  # Get the class name
        
        if status_type == "Completed":
            result = handler.get()
            video_url = result.get("video", {}).get("url")
            if not video_url:
                raise Exception("Failed to generate FlashHead video")
            print(f"✅ FlashHead video generated: {video_url}")
            break
        elif status_type == "Failed":
            raise Exception(f"fal.ai FlashHead task failed: {status.error}")
        elif status_type in ["Queued", "InProgress"]:
            print(f"fal.ai FlashHead task {status_type}... ({int(elapsed)}s elapsed)")
            time.sleep(5)  # Poll every 5 seconds
        else:
            raise Exception(f"Unknown fal.ai status: {status_type}")
    
    # Download the video and upload to S3
    s3 = boto3.client('s3', region_name=S3_REGION)
    
    # Download video from fal.ai
    video_response = requests.get(video_url)
    
    # Upload to S3
    import uuid
    video_key = f"flashhead/{user_id}/{uuid.uuid4().hex}.mp4"
    
    s3.put_object(
        Bucket=S3_BUCKET,
        Key=video_key,
        Body=video_response.content,
        ContentType='video/mp4',
        ACL='public-read'
    )
    
    # Generate public URL
    final_video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{video_key}"
    
    print(f"✅ FlashHead video uploaded to S3: {final_video_url}")
    
    return {
        "status": "completed",
        "video_url": final_video_url,
        "duration": result.get("duration", 0.0),
        "seed": result.get("seed", 0),
        "user_id": user_id,
        "credits_used": 8,  # FlashHead costs 8 credits
        "model": "fal-ai/flashhead",
        "voice": voice
    }


@app.function(image=image)
def health_check() -> dict:
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "propreel-render",
        "version": "2.1.0",
        "model": "fal-ai/minimax/hailuo-02",
        "clip_duration": 6,
        "resolutions": ["512p", "720p", "1080p"],
        "audio": False,
        "flashhead": "fal-ai/flashhead/v1/lip-sync"
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FASTAPI WEB ENDPOINTS
# ═══════════════════════════════════════════════════════════════════════════════

@web_app.get("/health")
async def health():
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "propreel-render",
        "version": "2.1.0",
        "model": "fal-ai/minimax/hailuo-02",
        "clip_duration": 6,
        "resolutions": ["512p", "720p", "1080p"],
        "audio": False,
        "flashhead": "fal-ai/flashhead/v1/lip-sync"
    }

@web_app.post("/render_video")
async def api_render_video(request: RenderVideoRequest):
    """API endpoint to render video — SPAWNS the job and returns immediately.

    For 1000-concurrent-user scale, the HTTP request must not hold a connection
    for the full multi-minute render. Clients poll /render_status instead.
    Backward compatible: ?wait=true blocks like the old behaviour.
    """
    try:
        if request.query_params.get("wait") in ("true", "1"):
            result = await render_video.remote.aio(
                record_id=request.record_id,
                tier=request.tier,
                config_index=request.config_index,
                orientation=request.orientation,
                images=request.images,
                voiceover_text=request.voiceover_text,
                voice_id=request.voice_id,
                include_agent_branding=request.include_agent_branding,
                music_url=request.music_url,
                image_prompts=request.image_prompts
            )
            return result

        # Async path: write initial job status to S3, then spawn
        _write_job_status(request.record_id, "queued", {"tier": request.tier})
        render_video.spawn(
            record_id=request.record_id,
            tier=request.tier,
            config_index=request.config_index,
            orientation=request.orientation,
            images=request.images,
            voiceover_text=request.voiceover_text,
            voice_id=request.voice_id,
            include_agent_branding=request.include_agent_branding,
            music_url=request.music_url,
            image_prompts=request.image_prompts
        )
        return {
            "record_id": request.record_id,
            "status": "queued",
            "poll_url": f"/render_status?record_id={request.record_id}",
            "message": "Render job accepted. Poll /render_status for progress."
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@web_app.get("/render_status")
async def api_render_status(record_id: str):
    """Poll render job status (S3-backed so any container can answer)."""
    status = _read_job_status(record_id)
    if status is None:
        raise HTTPException(status_code=404, detail=f"Unknown record_id: {record_id}")
    return status

@web_app.post("/generate_flashhead_video")
async def api_generate_flashhead_video(request: FlashHeadRequest):
    """API endpoint to generate FlashHead lip-sync video"""
    try:
        # Call the Modal function asynchronously
        result = await generate_flashhead_video.remote.aio(
            profile_image_url=request.profile_image_url,
            voiceover_text=request.voiceover_text,
            user_id=request.user_id,
            voice=request.voice,
            stability=request.stability
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@web_app.post("/edit_image")
async def api_edit_image(request: EditImageRequest):
    """API endpoint to edit image"""
    try:
        # Call the Modal function asynchronously
        result = await edit_image.remote.aio(
            image_url=request.image_url,
            preset_id=request.preset_id,
            custom_prompt=request.custom_prompt,
            strength=request.strength,
            guidance_scale=request.guidance_scale
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@web_app.get("/get_image_presets")
async def api_get_image_presets():
    """API endpoint to get all image presets"""
    try:
        # Call the Modal function
        result = get_image_presets.remote()
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# Mount the FastAPI app to Modal
@app.function(image=image)
@modal.asgi_app()
def web():
    """Mount FastAPI app as Modal web endpoint"""
    return web_app


@app.local_entrypoint()
def main():
    """Local entrypoint for testing"""
    print("PropReel Modal Backend v2.1")
    print("Video Model: fal-ai/minimax/hailuo-02")
    print("FlashHead Model: fal-ai/flashhead/v1/lip-sync")
    print("Clip Duration: 6 seconds")
    print("Resolutions: 512p, 720p, 1080p")
    print("Audio: OFF")
    print("\nAPI Endpoints:")
    print("  GET  /health")
    print("  POST /render_video")
    print("  POST /generate_flashhead_video")
    print("  POST /edit_image")
    print("  GET  /get_image_presets")
    print("\nUse 'modal deploy' to deploy this app")
