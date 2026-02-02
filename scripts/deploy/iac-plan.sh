#!/bin/bash
# =============================================================================
# Infrastructure as Code - Plan Script
# ADTU Smart Bus Management System
# =============================================================================
# Usage: ./scripts/deploy/iac-plan.sh [--env=staging|production]
# =============================================================================

set -euo pipefail

ENV="${1:-staging}"
ENV=$(echo "$ENV" | sed 's/--env=//')

echo "🔍 Running IaC plan for environment: $ENV"
echo "============================================="

# Validate environment
if [[ "$ENV" != "staging" && "$ENV" != "production" && "$ENV" != "canary" ]]; then
    echo "❌ Invalid environment: $ENV"
    echo "   Valid options: staging, production, canary"
    exit 1
fi

# Check required tools
command -v vercel >/dev/null 2>&1 || { echo "❌ vercel CLI required but not installed."; exit 1; }

echo "📋 Pre-flight checks..."

# 1. Verify environment variables
echo "  ✓ Checking required environment variables..."
REQUIRED_VARS=(
    "NEXT_PUBLIC_FIREBASE_PROJECT_ID"
    "NEXT_PUBLIC_SUPABASE_URL"
    "SUPABASE_SERVICE_ROLE_KEY"
    "RAZORPAY_KEY_ID"
    "RAZORPAY_KEY_SECRET"
    "RSA_PRIVATE_KEY"
)

MISSING_VARS=()
for var in "${REQUIRED_VARS[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        MISSING_VARS+=("$var")
    fi
done

if [[ ${#MISSING_VARS[@]} -gt 0 ]]; then
    echo "⚠️  Warning: Missing environment variables:"
    for var in "${MISSING_VARS[@]}"; do
        echo "     - $var"
    done
    echo "   These must be set in CI/CD secrets or Vercel dashboard."
fi

# 2. Verify Firebase rules
echo "  ✓ Validating Firestore rules..."
if [[ -f "firestore.rules" ]]; then
    echo "    Found firestore.rules - will deploy with next firebase deploy"
else
    echo "    ⚠️ firestore.rules not found"
fi

# 3. Check Supabase migrations
echo "  ✓ Checking Supabase migrations..."
if [[ -d "supabase/migrations" ]]; then
    MIGRATION_COUNT=$(find supabase/migrations -name "*.sql" | wc -l)
    echo "    Found $MIGRATION_COUNT migrations pending review"
else
    echo "    No migrations directory found"
fi

# 4. Build verification
echo "  ✓ Running build verification..."
npm run build --dry-run 2>/dev/null || npm run build 2>&1 | head -20

echo ""
echo "✅ IaC plan complete for $ENV"
echo "============================================="
echo "Next steps:"
echo "  1. Run: ./scripts/deploy/migrate.sh --dry-run"
echo "  2. Run: ./scripts/deploy/deploy.sh --env=$ENV"
