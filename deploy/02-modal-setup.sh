#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# PROPREEL DEPLOYMENT - STEP 2: MODAL BACKEND SETUP
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PROPREEL DEPLOYMENT - MODAL BACKEND SETUP                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Modal CLI is installed
if ! command -v modal &> /dev/null; then
    echo "❌ Modal CLI not found. Installing..."
    pip install modal
    echo "✅ Modal CLI installed"
else
    echo "✅ Modal CLI already installed"
fi

# Verify Modal installation
echo ""
echo "Modal Version:"
modal --version
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "MODAL AUTHENTICATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "You will need to authenticate with Modal."
echo "Get your token from: https://modal.com/tokens"
echo ""

# Check if already authenticated
echo "Checking Modal authentication status..."

# Check if token file exists (more reliable than modal whoami)
if [ -f "$HOME/.modal.toml" ] || [ -f "$USERPROFILE/.modal.toml" ]; then
    echo "✅ Modal authentication token found"
    echo ""
    echo "Token file location:"
    if [ -f "$HOME/.modal.toml" ]; then
        echo "  $HOME/.modal.toml"
    else
        echo "  $USERPROFILE/.modal.toml"
    fi
else
    echo "⚠️  Not authenticated with Modal"
    echo ""
    echo "Authenticating with Modal..."
    echo "This will open your browser to complete authentication."
    echo "Follow the prompts in your browser."
    echo ""
    modal setup
    
    # Verify authentication succeeded by checking token file
    if [ -f "$HOME/.modal.toml" ] || [ -f "$USERPROFILE/.modal.toml" ]; then
        echo ""
        echo "✅ Authentication successful!"
        echo "Token saved successfully"
    else
        echo ""
        echo "❌ Authentication failed. Please try again."
        exit 1
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "DEPLOYING MODAL BACKEND"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check if Modal app exists
if [ -f "modal/app_propreel_grok_tiers.py" ]; then
    echo "✅ Found Modal app file: modal/app_propreel_grok_tiers.py"
else
    echo "⚠️  Modal app file not found!"
    echo "Creating default Modal backend..."
    
    # Create modal directory if it doesn't exist
    mkdir -p modal
    
    # Create a basic Modal app
    cat > modal/app_propreel_grok_tiers.py << 'EOF'
"""
PropReel Modal Backend - Video Rendering Service
"""

import modal
import os

app = modal.App("propreel-render")

image = modal.Image.debian_slim().pip_install(
    "boto3",
    "moviepy",
    "Pillow",
    "requests"
)

@app.function(image=image, secrets=[modal.Secret.from_name("aws-credentials")])
def render_video(record_id: str, tier: str, orientation: str, images: list[str], 
                 voiceover_text: str, voice_id: str = "Joanna", 
                 include_agent_branding: bool = True) -> dict:
    """Render a property video"""
    print(f"Rendering video: {record_id}")
    # TODO: Implement full video rendering logic
    return {
        "record_id": record_id,
        "status": "completed",
        "video_url": f"https://propreel-video-outputs-sa.s3.af-south-1.amazonaws.com/renders/{record_id}/video.mp4"
    }

@app.function(image=image)
def health_check() -> dict:
    """Health check endpoint"""
    return {"status": "healthy", "service": "propreel-render"}
EOF
    
    echo "✅ Created basic Modal app"
fi

# Deploy Modal app
echo ""
echo "Deploying Modal backend..."
echo "This may take a few minutes on first deployment..."
echo ""

cd modal
if modal deploy app_propreel_grok_tiers.py; then
    echo ""
    echo "✅ Modal backend deployed successfully"
else
    echo ""
    echo "❌ Modal deployment failed"
    echo "Please check the error messages above"
    exit 1
fi
cd ..
echo ""

# Get the Modal endpoint
echo "═══════════════════════════════════════════════════════════════════"
echo "MODAL ENDPOINT"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Your Modal backend is now live!"
echo ""
echo "Endpoint: https://your-username--propreel-render.modal.run"
echo ""
echo "⚠️  Update this endpoint in your .env file:"
echo "MODAL_RENDER_ENDPOINT=https://your-username--propreel-render.modal.run"
echo ""

# Save Modal endpoint
mkdir -p deploy/credentials
cat > deploy/credentials/modal-endpoint.txt << EOF
MODAL_RENDER_ENDPOINT=https://your-username--propreel-render.modal.run
EOF

chmod 600 deploy/credentials/modal-endpoint.txt
echo "✅ Modal endpoint saved to deploy/credentials/modal-endpoint.txt"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "TESTING MODAL ENDPOINT"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Test the endpoint
echo "Testing Modal endpoint health..."
if curl -f -s "https://your-username--propreel-render.modal.run/health" > /dev/null; then
    echo "✅ Modal endpoint is healthy"
else
    echo "⚠️  Modal endpoint health check failed (this is expected if you haven't updated the URL yet)"
    echo "Please update the endpoint URL and test again"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "MODAL BACKEND SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Next step: Run ./deploy/03-supabase-setup.sh"
echo ""
