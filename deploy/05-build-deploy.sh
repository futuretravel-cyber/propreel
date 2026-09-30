#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# PROPREEL DEPLOYMENT - STEP 5: BUILD & DEPLOYMENT
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PROPREEL DEPLOYMENT - BUILD & DEPLOY                         ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if all credentials exist
echo "═══════════════════════════════════════════════════════════════════"
echo "VERIFYING DEPENDENCIES"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

MISSING_DEPS=0

if [ ! -f "deploy/credentials/aws-credentials.txt" ]; then
    echo "❌ AWS credentials not found"
    MISSING_DEPS=1
else
    echo "✅ AWS credentials found"
fi

if [ ! -f "deploy/credentials/supabase-credentials.txt" ]; then
    echo "❌ Supabase credentials not found"
    MISSING_DEPS=1
else
    echo "✅ Supabase credentials found"
fi

if [ ! -f "deploy/credentials/modal-endpoint.txt" ]; then
    echo "⚠️  Modal endpoint not found (optional)"
else
    echo "✅ Modal endpoint found"
fi

if [ $MISSING_DEPS -eq 1 ]; then
    echo ""
    echo "Please run the previous setup scripts first:"
    echo "  ./deploy/01-aws-setup.sh"
    echo "  ./deploy/02-modal-setup.sh"
    echo "  ./deploy/03-supabase-setup.sh"
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "LOADING CREDENTIALS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Load all credentials
source deploy/credentials/aws-credentials.txt
source deploy/credentials/supabase-credentials.txt

if [ -f "deploy/credentials/modal-endpoint.txt" ]; then
    source deploy/credentials/modal-endpoint.txt
fi

echo "✅ All credentials loaded"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "CREATING ENVIRONMENT FILE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Ask for additional credentials
read -p "Enter Paystack Public Key (or press Enter to skip): " PAYSTACK_PUBLIC_KEY
read -p "Enter Paystack Secret Key (or press Enter to skip): " PAYSTACK_SECRET_KEY
read -p "Enter xAI API Key (or press Enter to skip): " XAI_API_KEY
read -p "Enter Fal.ai API Key (or press Enter to skip): " FAL_API_KEY

# Create .env file
cat > .env << EOF
# ═══════════════════════════════════════════════════════════════════════════════
# PROPREEL ENVIRONMENT CONFIGURATION
# Generated on: $(date)
# ═══════════════════════════════════════════════════════════════════════════════

# ─── SUPABASE ─────────────────────────────────────────────────────────────────
VITE_SUPABASE_URL=$VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY

# ─── AWS S3 ───────────────────────────────────────────────────────────────────
AWS_ACCESS_KEY_ID=$AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY=$AWS_SECRET_ACCESS_KEY
AWS_REGION=$AWS_REGION
AWS_S3_RAW_BUCKET=$AWS_S3_RAW_BUCKET
AWS_S3_OUTPUT_BUCKET=$AWS_S3_OUTPUT_BUCKET

# ─── MODAL RENDER ENDPOINT ────────────────────────────────────────────────────
MODAL_RENDER_ENDPOINT=${MODAL_RENDER_ENDPOINT:-https://your-username--propreel-render.modal.run}

# ─── PAYSTACK ─────────────────────────────────────────────────────────────────
PAYSTACK_PUBLIC_KEY=${PAYSTACK_PUBLIC_KEY:-}
PAYSTACK_SECRET_KEY=${PAYSTACK_SECRET_KEY:-}

# ─── AI SERVICES ──────────────────────────────────────────────────────────────
XAI_API_KEY=${XAI_API_KEY:-}
FAL_API_KEY=${FAL_API_KEY:-}

# ─── APPLICATION ──────────────────────────────────────────────────────────────
VITE_APP_URL=https://propreel.co.za
NODE_ENV=production
EOF

chmod 600 .env
echo "✅ .env file created"
echo ""

# Show .env contents (masked)
echo "═══════════════════════════════════════════════════════════════════"
echo "ENVIRONMENT CONFIGURATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Supabase URL: $VITE_SUPABASE_URL"
echo "AWS Region: $AWS_REGION"
echo "S3 Raw Bucket: $AWS_S3_RAW_BUCKET"
echo "S3 Output Bucket: $AWS_S3_OUTPUT_BUCKET"
echo "Modal Endpoint: ${MODAL_RENDER_ENDPOINT:-Not configured}"
echo "Paystack: ${PAYSTACK_PUBLIC_KEY:+Configured}"
echo "xAI: ${XAI_API_KEY:+Configured}"
echo "Fal.ai: ${FAL_API_KEY:+Configured}"
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "INSTALLING DEPENDENCIES"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo "Installing npm dependencies..."
    npm install
    echo "✅ Dependencies installed"
else
    echo "✅ Dependencies already installed"
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "BUILDING APPLICATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Clean previous build
if [ -d "dist" ]; then
    echo "Cleaning previous build..."
    rm -rf dist
fi

# Build the application
echo "Building production bundle..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful"
else
    echo "❌ Build failed"
    exit 1
fi

echo ""
echo "Build output:"
ls -lh dist/
echo ""

echo "═══════════════════════════════════════════════════════════════════"
echo "DEPLOYMENT OPTIONS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Choose your deployment method:"
echo ""
echo "1. cPanel (Shared Hosting)"
echo "2. Vercel (Recommended)"
echo "3. Netlify"
echo "4. Manual Upload"
echo ""

read -p "Enter your choice (1-4): " deploy_choice

case $deploy_choice in
    1)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "DEPLOYING TO CPANEL"
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        echo "To deploy to cPanel:"
        echo ""
        echo "1. Log in to your cPanel account"
        echo "2. Navigate to File Manager"
        echo "3. Go to public_html directory"
        echo "4. Upload all files from dist/ folder"
        echo "5. Upload .htaccess file (create if needed)"
        echo ""
        echo "Creating .htaccess file..."
        
        cat > dist/.htaccess << 'EOF'
# Enable rewrite engine
RewriteEngine On

# Redirect all requests to index.html (SPA routing)
RewriteBase /
RewriteRule ^index\.html$ - [L]
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule . /index.html [L]

# Security headers
<IfModule mod_headers.c>
    Header set X-Content-Type-Options "nosniff"
    Header set X-Frame-Options "SAMEORIGIN"
    Header set X-XSS-Protection "1; mode=block"
    Header set Referrer-Policy "strict-origin-when-cross-origin"
</IfModule>

# Cache control for static assets
<IfModule mod_expires.c>
    ExpiresActive On
    ExpiresByType image/jpg "access plus 1 year"
    ExpiresByType image/jpeg "access plus 1 year"
    ExpiresByType image/gif "access plus 1 year"
    ExpiresByType image/png "access plus 1 year"
    ExpiresByType image/webp "access plus 1 year"
    ExpiresByType image/svg+xml "access plus 1 year"
    ExpiresByType text/css "access plus 1 month"
    ExpiresByType application/javascript "access plus 1 month"
    ExpiresByType application/pdf "access plus 1 month"
    ExpiresByType font/woff "access plus 1 year"
    ExpiresByType font/woff2 "access plus 1 year"
</IfModule>

# Gzip compression
<IfModule mod_deflate.c>
    AddOutputFilterByType DEFLATE text/html
    AddOutputFilterByType DEFLATE text/css
    AddOutputFilterByType DEFLATE application/javascript
    AddOutputFilterByType DEFLATE application/json
    AddOutputFilterByType DEFLATE image/svg+xml
</IfModule>
EOF
        
        echo "✅ .htaccess file created in dist/"
        echo ""
        echo "Now upload the dist/ folder contents to your cPanel public_html directory"
        echo ""
        ;;
    
    2)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "DEPLOYING TO VERCEL"
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        
        # Check if Vercel CLI is installed
        if ! command -v vercel &> /dev/null; then
            echo "Installing Vercel CLI..."
            npm install -g vercel
        fi
        
        echo "Deploying to Vercel..."
        echo ""
        
        # Deploy to Vercel
        vercel --prod
        
        echo ""
        echo "✅ Deployed to Vercel"
        echo ""
        ;;
    
    3)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "DEPLOYING TO NETLIFY"
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        
        # Check if Netlify CLI is installed
        if ! command -v netlify &> /dev/null; then
            echo "Installing Netlify CLI..."
            npm install -g netlify-cli
        fi
        
        echo "Deploying to Netlify..."
        echo ""
        
        # Deploy to Netlify
        netlify deploy --prod --dir=dist
        
        echo ""
        echo "✅ Deployed to Netlify"
        echo ""
        ;;
    
    4)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "MANUAL DEPLOYMENT"
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        echo "Build files are ready in the dist/ folder"
        echo "Upload them to your hosting provider"
        echo ""
        ;;
    
    *)
        echo "Invalid choice. Skipping deployment."
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "BUILD & DEPLOYMENT COMPLETE"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Next step: Run ./deploy/06-feature-activation.sh"
echo ""
