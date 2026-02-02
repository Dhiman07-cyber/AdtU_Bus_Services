#!/bin/bash
# =============================================================================
# ADTU Smart Bus Management System - API Test Suite
# =============================================================================
#
# AUTHORIZATION NOTICE:
# This script performs security and functional tests against the target API.
# Before executing:
#   1. Confirm target is a STAGING environment you own/control
#   2. Obtain written approval if testing against shared infrastructure
#   3. Never run destructive tests against production
#
# Required Tools: curl, jq, openssl
# Install: apt-get install curl jq openssl OR brew install curl jq openssl
#
# Required Environment Variables (create .env.test file):
#   STAGING_URL           - Base URL (e.g., https://staging.adtu-bus.vercel.app)
#   TEST_ADMIN_TOKEN      - JWT for test admin user
#   TEST_MODERATOR_TOKEN  - JWT for test moderator user
#   TEST_DRIVER_TOKEN     - JWT for test driver user
#   TEST_STUDENT_TOKEN    - JWT for test student user
#   TEST_STUDENT_UID      - UID of test student
#   RAZORPAY_WEBHOOK_SECRET - Webhook secret for signature testing
#   
# Run Command:
#   chmod +x scripts/tests/api_test_suite.sh
#   ./scripts/tests/api_test_suite.sh
#
# Expected Success:
#   - All tests show ✅ PASS
#   - Exit code 0
#
# Failure Handling:
#   - Failed tests show ❌ FAIL with details
#   - Exit code 1 if any test fails
#   - Review api_test_results.json for evidence
# =============================================================================

set -euo pipefail

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Load environment variables from .env.test if exists
if [[ -f ".env.test" ]]; then
    echo "Loading environment from .env.test..."
    export $(grep -v '^#' .env.test | xargs)
fi

# Configuration with defaults
STAGING_URL="${STAGING_URL:-http://localhost:3000}"
TEST_ADMIN_TOKEN="${TEST_ADMIN_TOKEN:-}"
TEST_MODERATOR_TOKEN="${TEST_MODERATOR_TOKEN:-}"
TEST_DRIVER_TOKEN="${TEST_DRIVER_TOKEN:-}"
TEST_STUDENT_TOKEN="${TEST_STUDENT_TOKEN:-}"
TEST_STUDENT_UID="${TEST_STUDENT_UID:-test_student_001}"
RAZORPAY_WEBHOOK_SECRET="${RAZORPAY_WEBHOOK_SECRET:-test_secret}"

# Test results array
declare -a TEST_RESULTS=()
PASSED=0
FAILED=0
SKIPPED=0

# Initialize results file
RESULTS_FILE="api_test_results.json"
echo "[]" > "$RESULTS_FILE"

# =============================================================================
# Helper Functions
# =============================================================================

log_test() {
    local name=$1
    local status=$2
    local details=${3:-""}
    local command=${4:-""}
    
    if [[ "$status" == "PASS" ]]; then
        echo -e "  ${GREEN}✅ PASS${NC} - $name"
        ((PASSED++))
    elif [[ "$status" == "FAIL" ]]; then
        echo -e "  ${RED}❌ FAIL${NC} - $name"
        [[ -n "$details" ]] && echo -e "         ${RED}$details${NC}"
        ((FAILED++))
    else
        echo -e "  ${YELLOW}⏭️  SKIP${NC} - $name"
        ((SKIPPED++))
    fi
    
    # Append to JSON results
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    local json_entry=$(jq -n \
        --arg name "$name" \
        --arg status "$status" \
        --arg details "$details" \
        --arg command "$command" \
        --arg timestamp "$timestamp" \
        '{test_name: $name, pass_fail: ($status == "PASS"), status: $status, details: $details, command_run: $command, timestamp: $timestamp, notes: ""}')
    
    # Append to results file
    jq ". += [$json_entry]" "$RESULTS_FILE" > tmp.$$.json && mv tmp.$$.json "$RESULTS_FILE"
}

require_token() {
    local token_name=$1
    local token_value=$2
    if [[ -z "$token_value" ]]; then
        log_test "$token_name token check" "SKIP" "Token not configured"
        return 1
    fi
    return 0
}

# =============================================================================
# Header
# =============================================================================

echo ""
echo "=============================================================="
echo " ADTU Smart Bus API Test Suite"
echo "=============================================================="
echo " Target: $STAGING_URL"
echo " Time:   $(date -u +%Y-%m-%dT%H:%M:%SZ)"
echo "=============================================================="
echo ""
echo "⚠️  AUTHORIZATION CHECK:"
echo "   Confirm this is a STAGING environment you are authorized to test."
echo "   Press Ctrl+C within 5 seconds to abort..."
sleep 5
echo ""

# =============================================================================
# 1. HEALTH & CONNECTIVITY TESTS
# =============================================================================

echo "📋 Section 1: Health & Connectivity"
echo "-----------------------------------"

# Test 1.1: Basic health check
HEALTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$STAGING_URL/api/health" 2>/dev/null || echo -e "\n000")
HEALTH_BODY=$(echo "$HEALTH_RESPONSE" | head -n -1)
HEALTH_STATUS=$(echo "$HEALTH_RESPONSE" | tail -n 1)

if [[ "$HEALTH_STATUS" == "200" ]]; then
    HEALTH_JSON=$(echo "$HEALTH_BODY" | jq -r '.status' 2>/dev/null || echo "")
    if [[ "$HEALTH_JSON" == "healthy" ]]; then
        log_test "Health endpoint returns healthy" "PASS" "" "curl $STAGING_URL/api/health"
    else
        log_test "Health endpoint returns healthy" "FAIL" "Status: $HEALTH_JSON"
    fi
else
    log_test "Health endpoint returns healthy" "FAIL" "HTTP $HEALTH_STATUS"
fi

# Test 1.2: Database health check
DB_RESPONSE=$(curl -s -w "\n%{http_code}" "$STAGING_URL/api/health/db" 2>/dev/null || echo -e "\n000")
DB_STATUS=$(echo "$DB_RESPONSE" | tail -n 1)

if [[ "$DB_STATUS" == "200" ]]; then
    log_test "Database connectivity check" "PASS"
else
    log_test "Database connectivity check" "FAIL" "HTTP $DB_STATUS"
fi

echo ""

# =============================================================================
# 2. AUTHENTICATION & RBAC TESTS
# =============================================================================

echo "📋 Section 2: Authentication & RBAC"
echo "------------------------------------"

# Test 2.1: Unauthenticated request should fail
UNAUTH_RESPONSE=$(curl -s -w "\n%{http_code}" "$STAGING_URL/api/admin/students" 2>/dev/null || echo -e "\n000")
UNAUTH_STATUS=$(echo "$UNAUTH_RESPONSE" | tail -n 1)

if [[ "$UNAUTH_STATUS" == "401" || "$UNAUTH_STATUS" == "403" ]]; then
    log_test "Unauthenticated admin endpoint returns 401/403" "PASS"
else
    log_test "Unauthenticated admin endpoint returns 401/403" "FAIL" "Got HTTP $UNAUTH_STATUS (expected 401 or 403)"
fi

# Test 2.2: Student cannot access admin endpoints
if require_token "TEST_STUDENT_TOKEN" "$TEST_STUDENT_TOKEN"; then
    STUDENT_ADMIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $TEST_STUDENT_TOKEN" \
        "$STAGING_URL/api/admin/students" 2>/dev/null || echo -e "\n000")
    STUDENT_ADMIN_STATUS=$(echo "$STUDENT_ADMIN_RESPONSE" | tail -n 1)
    
    if [[ "$STUDENT_ADMIN_STATUS" == "401" || "$STUDENT_ADMIN_STATUS" == "403" ]]; then
        log_test "Student token rejected for admin endpoint" "PASS"
    else
        log_test "Student token rejected for admin endpoint" "FAIL" "Got HTTP $STUDENT_ADMIN_STATUS (RBAC violation)"
    fi
fi

# Test 2.3: Driver cannot access moderator endpoints
if require_token "TEST_DRIVER_TOKEN" "$TEST_DRIVER_TOKEN"; then
    DRIVER_MOD_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $TEST_DRIVER_TOKEN" \
        "$STAGING_URL/api/moderators" 2>/dev/null || echo -e "\n000")
    DRIVER_MOD_STATUS=$(echo "$DRIVER_MOD_RESPONSE" | tail -n 1)
    
    if [[ "$DRIVER_MOD_STATUS" == "401" || "$DRIVER_MOD_STATUS" == "403" ]]; then
        log_test "Driver token rejected for moderator endpoint" "PASS"
    else
        log_test "Driver token rejected for moderator endpoint" "FAIL" "Got HTTP $DRIVER_MOD_STATUS (RBAC violation)"
    fi
fi

# Test 2.4: Admin can access admin endpoints
if require_token "TEST_ADMIN_TOKEN" "$TEST_ADMIN_TOKEN"; then
    ADMIN_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $TEST_ADMIN_TOKEN" \
        "$STAGING_URL/api/admin/students?limit=1" 2>/dev/null || echo -e "\n000")
    ADMIN_STATUS=$(echo "$ADMIN_RESPONSE" | tail -n 1)
    
    if [[ "$ADMIN_STATUS" == "200" ]]; then
        log_test "Admin token accepted for admin endpoint" "PASS"
    else
        log_test "Admin token accepted for admin endpoint" "FAIL" "Got HTTP $ADMIN_STATUS"
    fi
fi

echo ""

# =============================================================================
# 3. PAYMENT WEBHOOK SIGNATURE TESTS
# =============================================================================

echo "📋 Section 3: Payment Webhook Signature Verification"
echo "------------------------------------------------------"

# Test 3.1: Forged webhook (no signature) should be rejected
FORGED_PAYLOAD='{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_test123","order_id":"order_test123","amount":100000}}}}'

FORGED_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$FORGED_PAYLOAD" \
    "$STAGING_URL/api/payment/webhook/razorpay" 2>/dev/null || echo -e "\n000")
FORGED_STATUS=$(echo "$FORGED_RESPONSE" | tail -n 1)

if [[ "$FORGED_STATUS" == "400" || "$FORGED_STATUS" == "401" ]]; then
    log_test "Webhook without signature rejected" "PASS"
else
    log_test "Webhook without signature rejected" "FAIL" "Got HTTP $FORGED_STATUS (should reject unsigned webhooks)"
fi

# Test 3.2: Forged webhook (invalid signature) should be rejected
INVALID_SIG="invalid_signature_12345"

INVALID_SIG_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -H "X-Razorpay-Signature: $INVALID_SIG" \
    -d "$FORGED_PAYLOAD" \
    "$STAGING_URL/api/payment/webhook/razorpay" 2>/dev/null || echo -e "\n000")
INVALID_SIG_STATUS=$(echo "$INVALID_SIG_RESPONSE" | tail -n 1)

if [[ "$INVALID_SIG_STATUS" == "401" ]]; then
    log_test "Webhook with invalid signature rejected" "PASS"
else
    log_test "Webhook with invalid signature rejected" "FAIL" "Got HTTP $INVALID_SIG_STATUS (should be 401)"
fi

# Test 3.3: Valid signature should be accepted (compute HMAC)
VALID_PAYLOAD='{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_test_valid","order_id":"order_test_valid","amount":100000,"notes":{"enrollmentId":"TEST001","userId":"test_user"}}}}}'
VALID_SIGNATURE=$(echo -n "$VALID_PAYLOAD" | openssl dgst -sha256 -hmac "$RAZORPAY_WEBHOOK_SECRET" | awk '{print $2}')

if [[ "$RAZORPAY_WEBHOOK_SECRET" != "test_secret" ]]; then
    VALID_SIG_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -X POST \
        -H "Content-Type: application/json" \
        -H "X-Razorpay-Signature: $VALID_SIGNATURE" \
        -d "$VALID_PAYLOAD" \
        "$STAGING_URL/api/payment/webhook/razorpay" 2>/dev/null || echo -e "\n000")
    VALID_SIG_STATUS=$(echo "$VALID_SIG_RESPONSE" | tail -n 1)
    
    # Note: May return 404 for test user, but should not be 401
    if [[ "$VALID_SIG_STATUS" != "401" ]]; then
        log_test "Webhook with valid signature not rejected as unauthorized" "PASS"
    else
        log_test "Webhook with valid signature not rejected as unauthorized" "FAIL" "Got 401 with valid signature"
    fi
else
    log_test "Webhook with valid signature (real secret)" "SKIP" "Using placeholder secret"
fi

echo ""

# =============================================================================
# 4. PAYMENT IDEMPOTENCY TESTS
# =============================================================================

echo "📋 Section 4: Payment Idempotency (Replay Protection)"
echo "-------------------------------------------------------"

OPERATION_ID="op_test_$(date +%s)"

# Test 4.1: First payment request (would create order in real scenario)
# Note: This tests the verify-payment endpoint idempotency
echo "  Testing idempotency with operationId: $OPERATION_ID"

# Simulate a payment verification request
VERIFY_PAYLOAD=$(cat << EOF
{
    "razorpay_payment_id": "pay_idempotency_test_${OPERATION_ID}",
    "razorpay_order_id": "order_idempotency_test_${OPERATION_ID}",
    "razorpay_signature": "test_signature_not_valid",
    "operationId": "$OPERATION_ID"
}
EOF
)

# First request
FIRST_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$VERIFY_PAYLOAD" \
    "$STAGING_URL/api/payment/razorpay/verify-payment" 2>/dev/null || echo -e "\n000")
FIRST_STATUS=$(echo "$FIRST_RESPONSE" | tail -n 1)
FIRST_BODY=$(echo "$FIRST_RESPONSE" | head -n -1)

# Second request (replay)
SECOND_RESPONSE=$(curl -s -w "\n%{http_code}" \
    -X POST \
    -H "Content-Type: application/json" \
    -d "$VERIFY_PAYLOAD" \
    "$STAGING_URL/api/payment/razorpay/verify-payment" 2>/dev/null || echo -e "\n000")
SECOND_STATUS=$(echo "$SECOND_RESPONSE" | tail -n 1)
SECOND_BODY=$(echo "$SECOND_RESPONSE" | head -n -1)

# Both should return consistent results (no double processing)
# Note: May return 400 for invalid signature, but should be consistent
if [[ "$FIRST_STATUS" == "$SECOND_STATUS" ]]; then
    log_test "Payment replay returns consistent result" "PASS" "Both returned HTTP $FIRST_STATUS"
else
    log_test "Payment replay returns consistent result" "FAIL" "First: $FIRST_STATUS, Second: $SECOND_STATUS"
fi

echo ""

# =============================================================================
# 5. AUDIT TRAIL TESTS
# =============================================================================

echo "📋 Section 5: Audit Trail Verification"
echo "----------------------------------------"

if require_token "TEST_ADMIN_TOKEN" "$TEST_ADMIN_TOKEN"; then
    # Query recent audit logs
    AUDIT_RESPONSE=$(curl -s -w "\n%{http_code}" \
        -H "Authorization: Bearer $TEST_ADMIN_TOKEN" \
        "$STAGING_URL/api/admin/audit-logs?limit=5" 2>/dev/null || echo -e "\n000")
    AUDIT_STATUS=$(echo "$AUDIT_RESPONSE" | tail -n 1)
    AUDIT_BODY=$(echo "$AUDIT_RESPONSE" | head -n -1)
    
    if [[ "$AUDIT_STATUS" == "200" ]]; then
        # Check if audit entries have required fields
        HAS_FIELDS=$(echo "$AUDIT_BODY" | jq -r '.[0] | has("actorUid") and has("action") and has("timestamp")' 2>/dev/null || echo "false")
        
        if [[ "$HAS_FIELDS" == "true" ]]; then
            log_test "Audit logs contain required fields (actorUid, action, timestamp)" "PASS"
        else
            log_test "Audit logs contain required fields" "FAIL" "Missing actorUid, action, or timestamp"
        fi
    else
        log_test "Audit logs endpoint accessible" "FAIL" "HTTP $AUDIT_STATUS"
    fi
else
    log_test "Audit trail verification" "SKIP" "Admin token not configured"
fi

echo ""

# =============================================================================
# 6. RATE LIMITING TESTS
# =============================================================================

echo "📋 Section 6: Rate Limiting"
echo "----------------------------"

echo "  Sending rapid requests to test rate limiting..."

RATE_LIMIT_HIT=false
for i in {1..20}; do
    RATE_RESPONSE=$(curl -s -w "\n%{http_code}" "$STAGING_URL/api/health" 2>/dev/null || echo -e "\n000")
    RATE_STATUS=$(echo "$RATE_RESPONSE" | tail -n 1)
    
    if [[ "$RATE_STATUS" == "429" ]]; then
        RATE_LIMIT_HIT=true
        break
    fi
done

if [[ "$RATE_LIMIT_HIT" == "true" ]]; then
    log_test "Rate limiting enforced (429 returned after rapid requests)" "PASS"
else
    log_test "Rate limiting enforcement" "FAIL" "No 429 returned after 20 rapid requests (may need more aggressive testing)"
fi

echo ""

# =============================================================================
# 7. INPUT VALIDATION TESTS
# =============================================================================

echo "📋 Section 7: Input Validation (XSS/Injection)"
echo "------------------------------------------------"

# Test 7.1: XSS payload in query parameter
XSS_PAYLOAD='<script>alert("xss")</script>'
XSS_ENCODED=$(echo "$XSS_PAYLOAD" | jq -sRr @uri)

XSS_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$STAGING_URL/api/health?param=$XSS_ENCODED" 2>/dev/null || echo -e "\n000")
XSS_BODY=$(echo "$XSS_RESPONSE" | head -n -1)

if echo "$XSS_BODY" | grep -q "<script>"; then
    log_test "XSS payload reflected in response" "FAIL" "Script tags found in response body"
else
    log_test "XSS payload not reflected in response" "PASS"
fi

# Test 7.2: SQL injection attempt (should not cause 500)
SQLI_PAYLOAD="' OR '1'='1"

SQLI_RESPONSE=$(curl -s -w "\n%{http_code}" \
    "$STAGING_URL/api/students?search=$SQLI_PAYLOAD" 2>/dev/null || echo -e "\n000")
SQLI_STATUS=$(echo "$SQLI_RESPONSE" | tail -n 1)

if [[ "$SQLI_STATUS" != "500" ]]; then
    log_test "SQL injection does not cause server error" "PASS"
else
    log_test "SQL injection does not cause server error" "FAIL" "Got 500 (potential SQL error)"
fi

echo ""

# =============================================================================
# 8. KILL SWITCH TEST
# =============================================================================

echo "📋 Section 8: Master Kill Switch"
echo "----------------------------------"

# This would test the ENABLE_FIRESTORE_REALTIME toggle
# In production, this would check if listeners gracefully degrade
log_test "Kill switch toggle test" "SKIP" "Requires manual verification of ENABLE_FIRESTORE_REALTIME toggle"

echo ""

# =============================================================================
# SUMMARY
# =============================================================================

echo "=============================================================="
echo " TEST SUMMARY"
echo "=============================================================="
echo ""
echo -e " ${GREEN}✅ Passed: $PASSED${NC}"
echo -e " ${RED}❌ Failed: $FAILED${NC}"
echo -e " ${YELLOW}⏭️  Skipped: $SKIPPED${NC}"
echo ""
echo " Total: $((PASSED + FAILED + SKIPPED)) tests"
echo ""
echo " Results saved to: $RESULTS_FILE"
echo "=============================================================="

# Exit with appropriate code
if [[ $FAILED -gt 0 ]]; then
    echo ""
    echo -e "${RED}❌ TEST SUITE FAILED - Review failures above${NC}"
    exit 1
else
    echo ""
    echo -e "${GREEN}✅ TEST SUITE PASSED${NC}"
    exit 0
fi
