#!/bin/bash

# Quick deploy to Vercel (most common use case)
# Usage: ./quick-deploy.sh

set -e

echo "🚀 Quick Deploy to Vercel"
echo ""

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo "Installing Vercel CLI..."
    npm install -g vercel
fi

# Build
echo "Building project..."
npm run build

# Deploy
echo ""
echo "Deploying to Vercel..."
vercel --prod

echo ""
echo "✅ Deployed successfully!"
echo ""
