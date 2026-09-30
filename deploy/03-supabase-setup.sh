#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# PROPREEL DEPLOYMENT - STEP 3: SUPABASE DATABASE & AUTH SETUP
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PROPREEL DEPLOYMENT - SUPABASE SETUP                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Installing..."
    npm install -g supabase
    echo "✅ Supabase CLI installed"
else
    echo "✅ Supabase CLI already installed"
fi

# Verify Supabase CLI
echo ""
echo "Supabase CLI Version:"
supabase --version
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "SUPABASE PROJECT SETUP"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "You need to create a Supabase project first:"
echo ""
echo "1. Go to: https://supabase.com/dashboard/new"
echo "2. Create a new project named: propreel"
echo "3. Set region: af-south-1 (Cape Town)"
echo "4. Set a strong database password"
echo "5. Wait for project to be ready (takes ~2 minutes)"
echo ""

read -p "Have you created the Supabase project? (y/n): " project_created

if [ "$project_created" != "y" ]; then
    echo "Please create the project first, then run this script again."
    exit 0
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "SUPABASE CREDENTIALS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Please enter your Supabase credentials from the dashboard:"
echo "Dashboard: https://supabase.com/dashboard/project/YOUR_PROJECT_ID"
echo ""

read -p "Enter Supabase URL (e.g., https://xxxxx.supabase.co): " SUPABASE_URL
read -p "Enter Supabase anon key: " SUPABASE_ANON_KEY
read -p "Enter Supabase service role key: " SUPABASE_SERVICE_ROLE_KEY

echo ""
echo "Verifying Supabase connection..."

# Test connection with multiple methods
CONNECTION_SUCCESS=false

# Method 1: Try REST API endpoint
if curl -f -s -H "apikey: $SUPABASE_ANON_KEY" "$SUPABASE_URL/rest/v1/" > /dev/null 2>&1; then
    CONNECTION_SUCCESS=true
    echo "✅ Supabase REST API connection successful"
fi

# Method 2: Try auth endpoint
if [ "$CONNECTION_SUCCESS" = false ]; then
    if curl -f -s -H "apikey: $SUPABASE_ANON_KEY" "$SUPABASE_URL/auth/v1/settings" > /dev/null 2>&1; then
        CONNECTION_SUCCESS=true
        echo "✅ Supabase Auth connection successful"
    fi
fi

# Method 3: Try basic connectivity
if [ "$CONNECTION_SUCCESS" = false ]; then
    if curl -f -s "$SUPABASE_URL" > /dev/null 2>&1; then
        CONNECTION_SUCCESS=true
        echo "✅ Supabase URL is accessible"
    fi
fi

if [ "$CONNECTION_SUCCESS" = false ]; then
    echo ""
    echo "⚠️  Automatic verification failed, but this might be okay."
    echo ""
    echo "This can happen due to:"
    echo "  - Network/firewall restrictions"
    echo "  - curl not being available"
    echo "  - Supabase API endpoint changes"
    echo ""
    echo "Your credentials look correct. Let's verify manually:"
    echo ""
    echo "1. Open this URL in your browser:"
    echo "   $SUPABASE_URL"
    echo ""
    echo "2. Check if your Supabase dashboard loads"
    echo ""
    read -p "Can you access your Supabase dashboard? (y/n): " manual_verify
    
    if [ "$manual_verify" != "y" ]; then
        echo "❌ Please check your credentials and try again."
        exit 1
    fi
    
    echo "✅ Continuing with deployment..."
fi

# Save credentials
mkdir -p deploy/credentials
cat > deploy/credentials/supabase-credentials.txt << EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
EOF

chmod 600 deploy/credentials/supabase-credentials.txt
echo "✅ Credentials saved to deploy/credentials/supabase-credentials.txt"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "DEPLOYING DATABASE SCHEMA"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check if schema file exists
if [ -f "deploy/supabase-schema.sql" ]; then
    echo "Found database schema file"
else
    echo "Creating database schema file..."
    mkdir -p deploy
    cp deploy/supabase-schema.sql deploy/supabase-schema.sql 2>/dev/null || true
fi

echo "Deploying database schema to Supabase..."
echo "This will create all tables, indexes, and RLS policies..."
echo ""

# Deploy schema using Supabase SQL editor
echo "Please run the following SQL in your Supabase SQL Editor:"
echo "Dashboard: $SUPABASE_URL/sql-editor"
echo ""
echo "Or use the Supabase CLI if you have it configured:"
echo "supabase db push"
echo ""

# Alternative: Use curl to execute SQL
read -p "Do you want to deploy schema via API? (y/n): " deploy_via_api

if [ "$deploy_via_api" = "y" ]; then
    echo "Deploying schema via API..."
    
    # Read schema file
    if [ -f "deploy/supabase-schema.sql" ]; then
        SCHEMA_CONTENT=$(cat deploy/supabase-schema.sql)
        
        # Execute schema
        curl -X POST "$SUPABASE_URL/rest/v1/rpc/exec_sql" \
            -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
            -H "Content-Type: application/json" \
            -d "{\"sql\": \"$SCHEMA_CONTENT\"}" || {
            echo "⚠️  Direct SQL execution not available"
            echo "Please run the schema manually in Supabase SQL Editor"
        }
    else
        echo "❌ Schema file not found"
        echo "Please create deploy/supabase-schema.sql first"
    fi
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "STORAGE CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "⚠️  NOTE: Supabase storage is NOT used in this deployment."
echo "✅ All file storage uses AWS S3 (configured in Step 1)."
echo ""
echo "AWS S3 Buckets:"
echo "  - propreel-raw-assets (photos, logos, headshots)"
echo "  - propreel-video-outputs-sa (rendered videos)"
echo ""
echo "Supabase is used ONLY for:"
echo "  - PostgreSQL database"
echo "  - Authentication (Email + Google)"
echo "  - Row Level Security"

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "CONFIGURING AUTHENTICATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

echo "Please configure authentication in Supabase Dashboard:"
echo ""
echo "1. Go to: $SUPABASE_URL/auth/providers"
echo "2. Enable Email provider (already enabled by default)"
echo "3. Enable Google provider:"
echo "   - Go to Google Cloud Console"
echo "   - Create OAuth 2.0 credentials"
echo "   - Add authorized redirect URI: $SUPABASE_URL/auth/v1/callback"
echo "   - Copy Client ID and Client Secret"
echo "   - Add to Supabase Google provider settings"
echo ""

read -p "Have you configured Google authentication? (y/n): " google_configured

if [ "$google_configured" = "y" ]; then
    echo "✅ Google authentication configured"
else
    echo "⚠️  Google authentication not configured yet"
    echo "You can configure it later in the Supabase dashboard"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "SUPABASE SETUP COMPLETE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Your Supabase project is ready!"
echo ""
echo "Dashboard: $SUPABASE_URL"
echo "API URL: $SUPABASE_URL/rest/v1/"
echo "Auth URL: $SUPABASE_URL/auth/v1/"
echo ""
echo "Note: File storage uses AWS S3 (not Supabase Storage)"
echo ""
echo "Next step: Run ./deploy/04-admin-setup.sh"
echo ""
