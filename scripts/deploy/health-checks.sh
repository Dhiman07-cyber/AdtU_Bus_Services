#!/bin/bash
# =============================================================================
# Health Check Script
# ADTU Smart Bus Management System
# =============================================================================
# Usage: ./scripts/deploy/health-checks.sh [--url=https://...] [--full]
# =============================================================================

set -euo pipefail

BASE_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
FULL_CHECK=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --url=*)
            BASE_URL="${arg#*=}"
            shift
            ;;
        --full)
            FULL_CHECK=true
            shift
            ;;
    esac
done

echo "🏥 Health Checks - Target: $BASE_URL"
echo "============================================="

PASSED=0
FAILED=0
WARNINGS=0

check_endpoint() {
    local name=$1
    local endpoint=$2
    local expected_status=${3:-200}
    
    echo -n "  [$name] $endpoint... "
    
    HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$BASE_URL$endpoint" 2>/dev/null || echo "000")
    
    if [[ "$HTTP_STATUS" == "$expected_status" ]]; then
        echo "✅ ($HTTP_STATUS)"
        ((PASSED++))
    elif [[ "$HTTP_STATUS" == "000" ]]; then
        echo "❌ (timeout/unreachable)"
        ((FAILED++))
    else
        echo "⚠️  ($HTTP_STATUS, expected $expected_status)"
        ((WARNINGS++))
    fi
}

check_latency() {
    local name=$1
    local endpoint=$2
    local max_ms=${3:-500}
    
    echo -n "  [$name] Latency for $endpoint... "
    
    LATENCY=$(curl -s -o /dev/null -w "%{time_total}" --max-time 10 "$BASE_URL$endpoint" 2>/dev/null || echo "999")
    LATENCY_MS=$(echo "$LATENCY * 1000" | bc 2>/dev/null || echo "999000")
    LATENCY_MS=${LATENCY_MS%.*}
    
    if [[ $LATENCY_MS -lt $max_ms ]]; then
        echo "✅ (${LATENCY_MS}ms < ${max_ms}ms)"
        ((PASSED++))
    else
        echo "⚠️  (${LATENCY_MS}ms > ${max_ms}ms threshold)"
        ((WARNINGS++))
    fi
}

echo ""
echo "📋 Basic Health Checks"
echo "----------------------"

# Core endpoints
check_endpoint "Homepage" "/" 200
check_endpoint "API Health" "/api/health" 200

echo ""
echo "📋 API Endpoint Checks"
echo "----------------------"

check_endpoint "Auth" "/api/auth/session" 200
check_endpoint "Config" "/api/config" 200

if [[ "$FULL_CHECK" == "true" ]]; then
    echo ""
    echo "📋 Extended Health Checks"
    echo "-------------------------"
    
    # Latency checks
    check_latency "Homepage Latency" "/" 300
    check_latency "API Latency" "/api/health" 200
    
    # Database connectivity (via API)
    check_endpoint "Supabase Connection" "/api/health/db" 200
    
    # Payment system
    check_endpoint "Payment Config" "/api/razorpay/config" 200
fi

echo ""
echo "============================================="
echo "📊 Results: ✅ $PASSED passed | ⚠️  $WARNINGS warnings | ❌ $FAILED failed"

if [[ $FAILED -gt 0 ]]; then
    echo ""
    echo "❌ HEALTH CHECK FAILED"
    echo "   Do NOT proceed with deployment expansion"
    exit 1
elif [[ $WARNINGS -gt 0 ]]; then
    echo ""
    echo "⚠️  HEALTH CHECK PASSED WITH WARNINGS"
    echo "   Review warnings before proceeding"
    exit 0
else
    echo ""
    echo "✅ ALL HEALTH CHECKS PASSED"
    echo "   Safe to proceed with deployment"
    exit 0
fi
