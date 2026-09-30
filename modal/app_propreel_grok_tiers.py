"""
PropReel Modal Backend - Video Rendering Service

This Modal app handles video rendering requests from the PropReel platform.
It generates property videos using AI models and uploads results to S3.
"""

import modal
import os
import json
from pathlib import Path

# Define the Modal app
app = modal.App("propreel-render")

# Define the image with required dependencies
image = modal.Image.debian_slim().apt_install(
    "ffmpeg"
).pip_install(
    "boto3",
    "moviepy",
    "Pillow",
    "requests",
    "python-dotenv"
)

# S3 configuration
S3_BUCKET = os.environ.get("AWS_S3_OUTPUT_BUCKET", "propreel-video-outputs-sa")
S3_REGION = os.environ.get("AWS_REGION", "af-south-1")


@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials")])
def render_video(
    record_id: str,
    tier: str,
    orientation: str,
    images: list[str],
    voiceover_text: str,
    voice_id: str = "Joanna",
    include_agent_branding: bool = True
) -> dict:
    """
    Render a property video based on the provided parameters.
    
    Args:
        record_id: Unique identifier for this render job
        tier: Video tier (ESSENTIAL, SOCIAL, CINEMATIC, PREMIUM)
        orientation: Video orientation (LANDSCAPE or PORTRAIT)
        images: List of image URLs to include in the video
        voiceover_text: Text for the voiceover narration
        voice_id: Voice identifier for TTS (default: Joanna)
        include_agent_branding: Whether to include agent branding
    
    Returns:
        Dictionary with video URL and metadata
    """
    import boto3
    from moviepy import ImageClip, concatenate_videoclips, AudioFileClip
    from moviepy.video.fx import CrossFadeIn, Slide, Resize
    import requests
    from io import BytesIO
    from PIL import Image
    
    print(f"Starting render job: {record_id}")
    print(f"Tier: {tier}, Orientation: {orientation}")
    print(f"Images: {len(images)}, Voice: {voice_id}")
    
    # Tier configurations
    tier_configs = {
        "ESSENTIAL": {"duration": 15, "max_images": 4, "transition": "fade"},
        "SOCIAL": {"duration": 30, "max_images": 8, "transition": "slide"},
        "CINEMATIC": {"duration": 60, "max_images": 14, "transition": "zoom"},
        "PREMIUM": {"duration": 120, "max_images": 24, "transition": "cinematic"}
    }
    
    config = tier_configs.get(tier, tier_configs["SOCIAL"])
    
    # Set video dimensions based on orientation
    if orientation == "PORTRAIT":
        width, height = 1080, 1920
    else:
        width, height = 1920, 1080
    
    # Download and process images
    clips = []
    image_duration = config["duration"] / len(images[:config["max_images"]])
    
    for i, image_url in enumerate(images[:config["max_images"]]):
        print(f"Processing image {i+1}/{len(images)}")
        
        # Download image
        response = requests.get(image_url)
        img = Image.open(BytesIO(response.content))
        
        # Resize and crop to fit video dimensions
        img = img.resize((width, height), Image.Resampling.LANCZOS)
        
        # Save to temporary file
        temp_path = f"/tmp/{record_id}_img_{i}.jpg"
        img.save(temp_path, quality=95)
        
        # Create video clip
        clip = ImageClip(temp_path, duration=image_duration)
        
        # Add transition effect based on tier using moviepy 2.x API
        if config["transition"] == "fade":
            clip = clip.with_effects([CrossFadeIn(0.5)])
        elif config["transition"] == "slide":
            clip = clip.with_effects([Slide()])
        elif config["transition"] == "zoom":
            clip = clip.with_effects([Resize(lambda t: 1 + 0.1 * t)])
        
        clips.append(clip)
    
    # Concatenate all clips
    print("Concatenating video clips...")
    final_video = concatenate_videoclips(clips, method="compose")
    
    # Generate voiceover using AWS Polly
    print("Generating voiceover with AWS Polly...")
    polly_client = boto3.client('polly', region_name=S3_REGION)
    
    polly_response = polly_client.synthesize_speech(
        Text=voiceover_text,
        OutputFormat='mp3',
        VoiceId=voice_id,
        Engine='neural'
    )
    
    # Save audio to temporary file
    audio_path = f"/tmp/{record_id}_audio.mp3"
    with open(audio_path, 'wb') as f:
        f.write(polly_response['AudioStream'].read())
    
    # Add audio to video
    print("Adding audio to video...")
    audio_clip = AudioFileClip(audio_path)
    final_video = final_video.set_audio(audio_clip)
    
    # Add branding overlay if requested
    if include_agent_branding:
        print("Adding branding overlay...")
        # TODO: Implement branding overlay
        # This would add agent logo, name, and PropReel watermark
        pass
    
    # Export final video
    print("Exporting final video...")
    output_path = f"/tmp/{record_id}_output.mp4"
    final_video.write_videofile(
        output_path,
        fps=30,
        codec='libx264',
        audio_codec='aac',
        temp_audiofile=f'/tmp/{record_id}_temp_audio.m4a',
        remove_temp=True
    )
    
    # Upload to S3
    print("Uploading to S3...")
    s3_client = boto3.client('s3', region_name=S3_REGION)
    s3_key = f"renders/{record_id}/video.mp4"
    
    s3_client.upload_file(
        output_path,
        S3_BUCKET,
        s3_key,
        ExtraArgs={
            'ContentType': 'video/mp4',
            'ACL': 'public-read'
        }
    )
    
    # Generate public URL
    video_url = f"https://{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com/{s3_key}"
    
    print(f"✅ Render complete: {video_url}")
    
    # Clean up temporary files
    for clip in clips:
        clip.close()
    final_video.close()
    audio_clip.close()
    
    return {
        "record_id": record_id,
        "status": "completed",
        "video_url": video_url,
        "tier": tier,
        "orientation": orientation,
        "duration": config["duration"],
        "image_count": len(images[:config["max_images"]])
    }


@app.function(image=image)
def health_check() -> dict:
    """Health check endpoint"""
    return {
        "status": "healthy",
        "service": "propreel-render",
        "version": "1.0.0"
    }


@app.local_entrypoint()
def main():
    """Local entrypoint for testing"""
    print("PropReel Modal Backend")
    print("Use 'modal deploy' to deploy this app")
    print("Use 'modal run' to test locally")
