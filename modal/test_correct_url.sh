#!/bin/bash

# Quick test with the CORRECT URL
# Note: The web function URL has "-web" suffix!

WEB_URL="https://futuretravel--propreel-render-web.modal.run"

echo "═══════════════════════════════════════════════════════════════════"
echo "TESTING MODAL API (CORRECT URL)"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Web URL: $WEB_URL"
echo ""

# Test 1: Health Check
echo "Test 1: Health Check"
echo "GET $WEB_URL/health"
echo ""
curl -s "$WEB_URL/health" | jq '.' 2>/dev/null || curl -s "$WEB_URL/health"
echo ""
echo ""

# Test 2: Get Image Presets
echo "Test 2: Get Image Presets"
echo "GET $WEB_URL/get_image_presets"
echo ""
curl -s "$WEB_URL/get_image_presets" | jq 'length' 2>/dev/null && echo "presets found" || curl -s "$WEB_URL/get_image_presets"
echo ""
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "If you see JSON responses above, the API is working!"
echo "═══════════════════════════════════════════════════════════════════"
