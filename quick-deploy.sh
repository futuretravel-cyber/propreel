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
# 2026-10-15: `vercel --prod` failed once with a bare "Error: Not authorized"
# while the same CLI+token listed envs fine and deployed a minute later —
# a transient auth/session-refresh hiccup, not a scope or TTY problem (both
# were ruled out empirically). The explicit `deploy` subcommand with --yes
# keeps the call non-interactive, and a bounded retry rides out the refresh
# race instead of turning a live production push into a FAILED exit.
echo ""
echo "Deploying to Vercel..."
DEPLOY_OUT=""
for attempt in 1 2 3; do
  if DEPLOY_OUT=$(vercel deploy --prod --yes 2>&1); then
    printf '%s\n' "$DEPLOY_OUT" | tail -n 5
    break
  fi
  printf '%s\n' "$DEPLOY_OUT" | tail -n 6
  echo "⚠️  Deploy attempt $attempt/3 failed"
  if [ "$attempt" -lt 3 ]; then
    echo "   retrying in 15s…"
    sleep 15
  else
    echo "❌ All 3 deploy attempts failed — production was NOT updated."
    exit 1
  fi
done

echo ""
echo "✅ Deployed successfully!"
echo ""

#
# Retire every retained production deployment except the one just created.
#
# Vercel's Function Storage quota (10 GB on the free tier) accumulates one
# ~50MB lambda-snapshot set per RETAINED deployment — and on the new
# billing metering that counts even after the deployment is deleted but
# still inside the retention window. A session of frequent deploys used to
# reach the 100% banner within a month. Keeping exactly ONE retained
# deployment (the newest, still serving production through its aliases)
# keeps the current-storage footprint minimal.
#
# Never fails the deploy: a listing-parse hiccup must not turn a live
# production push into a FAILED exit.
#
prev_deployments=$(vercel ls 2>/dev/null | grep -oE "[a-z0-9-]+\.vercel\.app" | uniq)
count=$(printf '%s\n' "$prev_deployments" | grep -c . || true)

if [ "$count" -gt 1 ]; then
    echo "🧹 Retiring $((count - 1)) superseded production deployment(s)..."
    # `vercel ls` is newest-first; the first URL is the deployment we just
    # created, everything after it is a snapshot we no longer need.
    echo "$prev_deployments" | tail -n +2 | while read -r old; do
        vercel rm "$old" --yes >/dev/null 2>&1 \
            && echo "  removed: $old" \
            || echo "  (skipped $old — will fall out of the retention window)"
    done
fi

echo ""
echo "🌐 Live at https://www.propreel.co.za"
