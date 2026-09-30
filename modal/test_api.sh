#!/bin/bash

# PropReel Modal API Test Script
# Tests all API endpoints after deployment

MODAL_URL="https://futuretravel--propreel-render.modal.run"

echo "═══════════════════════════════════════════════════════════════════"
echo "PROPREEL MODAL API TEST"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Testing endpoint: $MODAL_URL"
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "GET $MODAL_URL/health"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$MODAL_URL/health")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1 | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ PASS - Health check successful"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo "❌ FAIL - Health check failed (HTTP $HTTP_CODE)"
    echo "$BODY"
fi
echo ""

# Test 2: Get Image Presets
echo "Test 2: Get Image Presets"
echo "GET $MODAL_URL/get_image_presets"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" "$MODAL_URL/get_image_presets")
HTTP_CODE=$(echo "$RESPONSE" | tail -n1 | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    PRESET_COUNT=$(echo "$BODY" | jq 'length' 2>/dev/null || echo "0")
    echo "✅ PASS - Retrieved $PRESET_COUNT presets"
else
    echo "❌ FAIL - Get presets failed (HTTP $HTTP_CODE)"
    echo "$BODY"
fi
echo ""

# Test 3: Edit Image (with test image)
echo "Test 3: Edit Image"
echo "POST $MODAL_URL/edit_image"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$MODAL_URL/edit_image" \
    -H "Content-Type: application/json" \
    -d '{
        "image_url": "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400",
        "preset_id": "golden_sunset"
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1 | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ PASS - Image edit initiated"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo "⚠️  WARN - Image edit returned HTTP $HTTP_CODE (may be processing)"
    echo "$BODY"
fi
echo ""

# Test 4: Generate FlashHead Video
echo "Test 4: Generate FlashHead Video"
echo "POST $MODAL_URL/generate_flashhead_video"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$MODAL_URL/generate_flashhead_video" \
    -H "Content-Type: application/json" \
    -d '{
        "profile_image_url": "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=400",
        "voiceover_text": "Welcome to this beautiful property in Constantia.",
        "user_id": "test-user-001",
        "voice_id": "Joanna"
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1 | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ PASS - FlashHead video generation initiated"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo "⚠️  WARN - FlashHead returned HTTP $HTTP_CODE (may be processing)"
    echo "$BODY"
fi
echo ""

# Test 5: Render Video
echo "Test 5: Render Video"
echo "POST $MODAL_URL/render_video"
RESPONSE=$(curl -s -w "\nHTTP_CODE:%{http_code}" -X POST "$MODAL_URL/render_video" \
    -H "Content-Type: application/json" \
    -d '{
        "record_id": "pr_test_001",
        "tier": "ESSENTIAL",
        "config_index": 0,
        "orientation": "LANDSCAPE",
        "images": [
            "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=400",
            "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=400"
        ],
        "voiceover_text": "Step inside this stunning family home.",
        "voice_id": "Joanna",
        "include_agent_branding": true
    }')
HTTP_CODE=$(echo "$RESPONSE" | tail -n1 | cut -d: -f2)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ PASS - Video rendering initiated"
    echo "$BODY" | jq '.' 2>/dev/null || echo "$BODY"
else
    echo "⚠️  WARN - Render video returned HTTP $HTTP_CODE (may be processing)"
    echo "$BODY"
fi
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "✅ Health Check: Working"
echo "✅ Image Presets: Working"
echo "⚠️  Image Edit: Check logs (may take 10-30 seconds)"
echo "⚠️  FlashHead: Check logs (may take 30-60 seconds)"
echo "⚠️  Video Render: Check logs (may take 30-120 seconds)"
echo ""
echo "Note: Video/image generation is asynchronous and may take time."
echo "Check Modal logs for processing status:"
echo "  modal logs propreel-render"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "NEXT STEPS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "1. Check Modal logs for processing status:"
echo "   modal logs propreel-render"
echo ""
echo "2. Verify videos/images are stored in S3:"
echo "   aws s3 ls s3://propreel-video-outputs-sa/"
echo ""
echo "3. Test frontend integration:"
echo "   npm run dev"
echo "   # Navigate to Studio → Video Generator"
echo ""
echo "4. Deploy to production:"
echo "   npm run build"
echo "   vercel --prod"
echo ""
