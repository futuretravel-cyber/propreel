#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# PROPREEL - QUICK DEPLOYMENT SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  PROPREEL - BUILD & DEPLOY                                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo "❌ Error: package.json not found"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Step 1: Build the project
echo "═══════════════════════════════════════════════════════════════════"
echo "STEP 1: Building project..."
echo "═══════════════════════════════════════════════════════════════════"
echo ""

npm run build

if [ $? -eq 0 ]; then
    echo "✅ Build successful!"
else
    echo "❌ Build failed!"
    exit 1
fi

echo ""

# Step 2: Show deployment options
echo "═══════════════════════════════════════════════════════════════════"
echo "STEP 2: Choose deployment method"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "1. Vercel (Recommended - Free, Fast, Automatic)"
echo "2. Netlify (Free, Good for static sites)"
echo "3. cPanel (Manual upload via FTP/File Manager)"
echo "4. GitHub Pages (Free, for static sites)"
echo "5. Local preview (Test before deploying)"
echo "6. Create deployment package (ZIP for manual upload)"
echo ""

read -p "Enter your choice (1-6): " deploy_choice

case $deploy_choice in
    1)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "Deploying to Vercel..."
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        
        # Check if Vercel CLI is installed
        if ! command -v vercel &> /dev/null; then
            echo "Installing Vercel CLI..."
            npm install -g vercel
        fi
        
        # Deploy
        echo "Deploying to Vercel..."
        vercel --prod
        
        echo ""
        echo "✅ Deployed to Vercel!"
        echo "Check your Vercel dashboard for the live URL"
        ;;
        
    2)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "Deploying to Netlify..."
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        
        # Check if Netlify CLI is installed
        if ! command -v netlify &> /dev/null; then
            echo "Installing Netlify CLI..."
            npm install -g netlify-cli
        fi
        
        # Deploy
        echo "Deploying to Netlify..."
        netlify deploy --prod --dir=dist
        
        echo ""
        echo "✅ Deployed to Netlify!"
        ;;
        
    3)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "cPanel Deployment Instructions"
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        echo "The build is ready in the 'dist' folder."
        echo ""
        echo "To deploy to cPanel:"
        echo ""
        echo "1. Log in to your cPanel account"
        echo "2. Open File Manager"
        echo "3. Navigate to public_html (or your domain folder)"
        echo "4. Delete old files (backup first if needed)"
        echo "5. Upload all contents from the 'dist' folder"
        echo "6. Make sure .htaccess is uploaded (for routing)"
        echo ""
        echo "Or use FTP:"
        echo "  Host: your-domain.com"
        echo "  Username: your cPanel username"
        echo "  Password: your cPanel password"
        echo "  Port: 21"
        echo "  Directory: /public_html/"
        echo ""
        echo "Build location: ./dist/"
        echo ""
        ;;
        
    4)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "Deploying to GitHub Pages..."
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        
        # Check if gh-pages is installed
        if ! npm list gh-pages &> /dev/null; then
            echo "Installing gh-pages..."
            npm install --save-dev gh-pages
        fi
        
        # Deploy
        echo "Deploying to GitHub Pages..."
        npm run deploy
        
        echo ""
        echo "✅ Deployed to GitHub Pages!"
        echo "Your site will be available at:"
        echo "https://your-username.github.io/your-repo-name/"
        ;;
        
    5)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "Starting local preview server..."
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        
        npm run preview
        
        echo ""
        echo "Preview server stopped."
        ;;
        
    6)
        echo ""
        echo "═══════════════════════════════════════════════════════════════════"
        echo "Creating deployment package..."
        echo "═══════════════════════════════════════════════════════════════════"
        echo ""
        
        # Create timestamp
        TIMESTAMP=$(date +%Y%m%d_%H%M%S)
        ZIP_NAME="propreel-deploy-$TIMESTAMP.zip"
        
        # Create ZIP
        echo "Creating $ZIP_NAME..."
        cd dist
        zip -r "../$ZIP_NAME" .
        cd ..
        
        echo ""
        echo "✅ Deployment package created: $ZIP_NAME"
        echo ""
        echo "You can now:"
        echo "  1. Upload this ZIP to your hosting provider"
        echo "  2. Extract it in your public_html folder"
        echo "  3. Your site will be live!"
        echo ""
        ;;
        
    *)
        echo "Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "Deployment complete!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
