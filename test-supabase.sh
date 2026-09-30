#!/bin/bash

# Quick Supabase Connection Test
# Usage: bash test-supabase.sh

echo "═══════════════════════════════════════════════════════════════════"
echo "SUPABASE CONNECTION TEST"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Load credentials if they exist
if [ -f "deploy/credentials/supabase-credentials.txt" ]; then
    source deploy/credentials/supabase-credentials.txt
    echo "✅ Loaded credentials from deploy/credentials/supabase-credentials.txt"
else
    echo "⚠️  No credentials file found. Please enter your Supabase details:"
    echo ""
    read -p "Supabase URL: " VITE_SUPABASE_URL
    read -p "Anon Key: " VITE_SUPABASE_ANON_KEY
    read -p "Service Role Key: " SUPABASE_SERVICE_ROLE_KEY
fi

echo ""
echo "Testing connection to: $VITE_SUPABASE_URL"
echo ""

# Test 1: Basic connectivity
echo "Test 1: Basic URL accessibility..."
if curl -s -o /dev/null -w "%{http_code}" "$VITE_SUPABASE_URL" | grep -q "200\|301\|302"; then
    echo "✅ URL is accessible"
else
    echo "❌ URL is not accessible"
    echo "   Please check if your Supabase project is active"
fi
echo ""

# Test 2: REST API with anon key
echo "Test 2: REST API with anon key..."
RESPONSE=$(curl -s -w "\n%{http_code}" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    -H "Authorization: Bearer $VITE_SUPABASE_ANON_KEY" \
    "$VITE_SUPABASE_URL/rest/v1/")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | sed '$d')

if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "401" ] || [ "$HTTP_CODE" = "406" ]; then
    echo "✅ REST API is responding (HTTP $HTTP_CODE)"
    echo "   Note: 401/406 is expected without a valid table query"
else
    echo "❌ REST API not responding correctly (HTTP $HTTP_CODE)"
fi
echo ""

# Test 3: Auth API
echo "Test 3: Auth API..."
AUTH_RESPONSE=$(curl -s -w "\n%{http_code}" -H "apikey: $VITE_SUPABASE_ANON_KEY" \
    "$VITE_SUPABASE_URL/auth/v1/settings")

AUTH_CODE=$(echo "$AUTH_RESPONSE" | tail -n1)

if [ "$AUTH_CODE" = "200" ]; then
    echo "✅ Auth API is responding"
else
    echo "⚠️  Auth API returned HTTP $AUTH_CODE (might be okay)"
fi
echo ""

# Test 4: Service role key (if provided)
if [ -n "$SUPABASE_SERVICE_ROLE_KEY" ]; then
    echo "Test 4: Service role key..."
    SR_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
        -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
        "$VITE_SUPABASE_URL/rest/v1/")
    
    SR_CODE=$(echo "$SR_RESPONSE" | tail -n1)
    
    if [ "$SR_CODE" = "200" ] || [ "$SR_CODE" = "401" ] || [ "$SR_CODE" = "406" ]; then
        echo "✅ Service role key is valid"
    else
        echo "❌ Service role key might be invalid (HTTP $SR_CODE)"
    fi
    echo ""
fi

# Summary
echo "═══════════════════════════════════════════════════════════════════"
echo "TEST SUMMARY"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "If most tests passed, your Supabase connection is working!"
echo ""
echo "Next steps:"
echo "  1. Run: bash deploy/03-supabase-setup.sh"
echo "  2. Or manually deploy the schema in Supabase SQL Editor"
echo ""
echo "Manual schema deployment:"
echo "  1. Go to: $VITE_SUPABASE_URL/sql-editor"
echo "  2. Copy contents of: deploy/supabase-schema.sql"
echo "  3. Paste and run the SQL"
echo ""
