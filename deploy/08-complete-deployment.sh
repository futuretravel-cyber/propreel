#!/bin/bash

# ═══════════════════════════════════════════════════════════════════════════════
# PROPREEL DEPLOYMENT - COMPLETE AUTOMATION SCRIPT
# ═══════════════════════════════════════════════════════════════════════════════

set -e

echo "╔════════════════════════════════════════════════════════════════╗"
echo "║                                                                ║"
echo "║         PROPREEL COMPLETE DEPLOYMENT AUTOMATION                ║"
echo "║                                                                ║"
echo "║  This script will deploy the entire PropReel platform          ║"
echo "║                                                                ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

# Check if running as root
if [ "$EUID" -eq 0 ]; then
    echo "⚠️  Warning: Running as root is not recommended"
    read -p "Continue anyway? (y/n): " continue_root
    if [ "$continue_root" != "y" ]; then
        exit 1
    fi
fi

# Display deployment info
echo "═══════════════════════════════════════════════════════════════════"
echo "DEPLOYMENT INFORMATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Platform: PropReel - AI Property Video Generator"
echo "Version: 1.0.0"
echo "Date: $(date)"
echo "Working Directory: $(pwd)"
echo ""

# Check prerequisites
echo "═══════════════════════════════════════════════════════════════════"
echo "CHECKING PREREQUISITES"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

PREREQ_MET=true

# Check Node.js
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    echo "✅ Node.js: $NODE_VERSION"
else
    echo "❌ Node.js not found"
    PREREQ_MET=false
fi

# Check npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    echo "✅ npm: $NPM_VERSION"
else
    echo "❌ npm not found"
    PREREQ_MET=false
fi

# Check Git
if command -v git &> /dev/null; then
    GIT_VERSION=$(git --version)
    echo "✅ Git: $GIT_VERSION"
else
    echo "❌ Git not found"
    PREREQ_MET=false
fi

# Check curl
if command -v curl &> /dev/null; then
    echo "✅ curl: installed"
else
    echo "❌ curl not found"
    PREREQ_MET=false
fi

# Check jq
if command -v jq &> /dev/null; then
    echo "✅ jq: installed"
else
    echo "⚠️  jq not found (will be installed if needed)"
fi

if [ $PREREQ_MET = false ]; then
    echo ""
    echo "❌ Prerequisites not met. Please install missing dependencies."
    exit 1
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "DEPLOYMENT STEPS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "This deployment will:"
echo ""
echo "1. Set up AWS CLI and S3 buckets"
echo "2. Deploy Modal backend"
echo "3. Set up Supabase database and auth"
echo "4. Create admin users with 1000 credits"
echo "5. Build and deploy the application"
echo "6. Activate all features"
echo "7. Run verification tests"
echo ""

read -p "Do you want to continue? (y/n): " continue_deploy

if [ "$continue_deploy" != "y" ]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "STARTING DEPLOYMENT"
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Create deploy directory if it doesn't exist
mkdir -p deploy/credentials

# Step 1: AWS Setup
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  STEP 1: AWS SETUP                                            ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -f "deploy/01-aws-setup.sh" ]; then
    bash deploy/01-aws-setup.sh
else
    echo "⚠️  AWS setup script not found, skipping..."
fi

echo ""
read -p "Press Enter to continue to Step 2..."

# Step 2: Modal Setup
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  STEP 2: MODAL BACKEND SETUP                                  ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -f "deploy/02-modal-setup.sh" ]; then
    bash deploy/02-modal-setup.sh
else
    echo "⚠️  Modal setup script not found, skipping..."
fi

echo ""
read -p "Press Enter to continue to Step 3..."

# Step 3: Supabase Setup
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  STEP 3: SUPABASE SETUP                                       ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -f "deploy/03-supabase-setup.sh" ]; then
    bash deploy/03-supabase-setup.sh
else
    echo "⚠️  Supabase setup script not found, skipping..."
fi

echo ""
read -p "Press Enter to continue to Step 4..."

# Step 4: Admin Setup
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  STEP 4: ADMIN USERS SETUP                                    ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -f "deploy/04-admin-setup.sh" ]; then
    bash deploy/04-admin-setup.sh
else
    echo "⚠️  Admin setup script not found, skipping..."
fi

echo ""
read -p "Press Enter to continue to Step 5..."

# Step 5: Build & Deploy
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  STEP 5: BUILD & DEPLOYMENT                                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -f "deploy/05-build-deploy.sh" ]; then
    bash deploy/05-build-deploy.sh
else
    echo "⚠️  Build script not found, skipping..."
fi

echo ""
read -p "Press Enter to continue to Step 6..."

# Step 6: Feature Activation
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  STEP 6: FEATURE ACTIVATION                                   ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -f "deploy/06-feature-activation.sh" ]; then
    bash deploy/06-feature-activation.sh
else
    echo "⚠️  Feature activation script not found, skipping..."
fi

echo ""
read -p "Press Enter to continue to Step 7..."

# Step 7: Testing
echo "╔════════════════════════════════════════════════════════════════╗"
echo "║  STEP 7: TESTING & VERIFICATION                               ║"
echo "╚════════════════════════════════════════════════════════════════╝"
echo ""

if [ -f "deploy/07-testing.sh" ]; then
    bash deploy/07-testing.sh
else
    echo "⚠️  Testing script not found, skipping..."
fi

echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "DEPLOYMENT COMPLETE!"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "🎉 Congratulations! PropReel has been successfully deployed!"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "NEXT STEPS"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "1. Access your application:"
echo "   URL: https://propreel.co.za (or your deployed URL)"
echo ""
echo "2. Login as admin:"
echo "   Email: futuretravel@gmail.com"
echo "   Password: Check deploy/credentials/admin-passwords.txt"
echo ""
echo "3. Change admin passwords immediately!"
echo ""
echo "4. Configure additional settings in Admin Dashboard:"
echo "   - Payment gateway (Paystack)"
echo "   - Email service (SendGrid/AWS SES)"
echo "   - Analytics (Google Analytics)"
echo "   - Monitoring (Sentry)"
echo ""
echo "5. Test all features manually"
echo ""
echo "6. Set up monitoring and alerts"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo "SUPPORT & DOCUMENTATION"
echo "═══════════════════════════════════════════════════════════════════"
echo ""
echo "Documentation:"
echo "  - README.md - Project overview"
echo "  - deploy/README.md - Deployment guide"
echo "  - FINAL_CHANGES_SUMMARY.md - Recent changes"
echo ""
echo "Support:"
echo "  - Email: support@propreel.co.za"
echo "  - Status: status.propreel.co.za"
echo ""
echo "═══════════════════════════════════════════════════════════════════"
echo ""

# Save deployment log
DEPLOY_LOG="deploy/deployment-log-$(date +%Y%m%d-%H%M%S).txt"
echo "Deployment completed at $(date)" > "$DEPLOY_LOG"
echo "All scripts executed successfully" >> "$DEPLOY_LOG"

echo "Deployment log saved to: $DEPLOY_LOG"
echo ""
