#!/bin/bash
# =============================================================================
# ADTU Smart Bus Management System - Emergency Rollback Script
# =============================================================================
#
# AUTHORIZATION NOTICE:
# This script performs a production rollback. Before executing:
#   1. Confirm incident severity warrants rollback
#   2. Collect reconciliation evidence BEFORE rollback
#   3. Get explicit approval from incident commander
#   4. Document the incident in your tracking system
#
# Required Tools: curl, jq, git, vercel CLI (optional)
#
# Required Environment Variables:
#   VERCEL_TOKEN         - Vercel API token
#   STAGING_URL          - Staging URL for health checks
#   PRODUCTION_URL       - Production URL
#
# Run Command:
#   chmod +x scripts/deploy/rollback.sh
#   ./scripts/deploy/rollback.sh [--confirm] [--to=<commit>] [--skip-reconcile]
#
# =============================================================================

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Arguments
CONFIRM=false
TARGET_COMMIT=""
SKIP_RECONCILE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --confirm)
            CONFIRM=true
            shift
            ;;
        --to=*)
            TARGET_COMMIT="${arg#*=}"
            shift
            ;;
        --skip-reconcile)
            SKIP_RECONCILE=true
            shift
            ;;
    esac
done

# Configuration
PRODUCTION_URL="${PRODUCTION_URL:-https://adtu-bus.vercel.app}"
STAGING_URL="${STAGING_URL:-}"
ROLLBACK_LOG="rollback_evidence_$(date +%Y%m%d_%H%M%S).json"

# =============================================================================
# Functions
# =============================================================================

print_header() {
    echo ""
    echo -e "${RED}============================================================${NC}"
    echo -e "${RED} 🚨 EMERGENCY ROLLBACK - ADTU Smart Bus System${NC}"
    echo -e "${RED}============================================================${NC}"
    echo ""
}

collect_reconciliation() {
    echo -e "${CYAN}📊 Collecting reconciliation evidence...${NC}"
    
    local evidence="{}"
    local timestamp=$(date -u +%Y-%m-%dT%H:%M:%SZ)
    
    # Collect current deployment info
    evidence=$(echo "$evidence" | jq --arg ts "$timestamp" '. + {timestamp: $ts}')
    
    # Get current commit
    local current_commit=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
    evidence=$(echo "$evidence" | jq --arg cc "$current_commit" '. + {current_commit: $cc}')
    
    # Try to get deployment status
    if [[ -n "${PRODUCTION_URL:-}" ]]; then
        echo "  Checking production health..."
        local health_status=$(curl -s -w "%{http_code}" -o /tmp/health_body.json "$PRODUCTION_URL/api/health" 2>/dev/null || echo "000")
        evidence=$(echo "$evidence" | jq --arg hs "$health_status" '. + {production_health_status: $hs}')
        
        if [[ "$health_status" == "200" ]]; then
            local health_body=$(cat /tmp/health_body.json 2>/dev/null || echo "{}")
            evidence=$(echo "$evidence" | jq --argjson hb "$health_body" '. + {production_health_body: $hb}')
        fi
    fi
    
    # Get recent deployment log
    if [[ -f ".deployments.log" ]]; then
        local recent_deploys=$(tail -5 .deployments.log 2>/dev/null || echo "[]")
        evidence=$(echo "$evidence" | jq --arg rd "$recent_deploys" '. + {recent_deployments: $rd}')
    fi
    
    # Save evidence
    echo "$evidence" | jq '.' > "$ROLLBACK_LOG"
    echo -e "  ${GREEN}✓ Evidence saved to: $ROLLBACK_LOG${NC}"
}

toggle_kill_switch() {
    echo -e "${CYAN}🔌 Activating master kill switch...${NC}"
    echo "  Setting ENABLE_FIRESTORE_REALTIME=false"
    
    # This would call your feature flag API if available
    # For now, log the action
    echo "  ⚠️  Manual action required:"
    echo "     Set environment variable: ENABLE_FIRESTORE_REALTIME=false"
    echo "     Or update feature flag in your dashboard"
}

run_integrity_checks() {
    echo -e "${CYAN}🔍 Running integrity checks...${NC}"
    
    local checks_passed=true
    
    # Check 1: Health endpoint
    if [[ -n "${PRODUCTION_URL:-}" ]]; then
        local health=$(curl -s -o /dev/null -w "%{http_code}" "$PRODUCTION_URL/api/health" 2>/dev/null || echo "000")
        if [[ "$health" == "200" ]]; then
            echo "  ✅ Health check: PASS"
        else
            echo "  ❌ Health check: FAIL (HTTP $health)"
            checks_passed=false
        fi
    fi
    
    # Check 2: Database connectivity
    if [[ -n "${PRODUCTION_URL:-}" ]]; then
        local db_health=$(curl -s -o /dev/null -w "%{http_code}" "$PRODUCTION_URL/api/health/db" 2>/dev/null || echo "000")
        if [[ "$db_health" == "200" ]]; then
            echo "  ✅ Database check: PASS"
        else
            echo "  ⚠️  Database check: HTTP $db_health"
        fi
    fi
    
    if [[ "$checks_passed" == "false" ]]; then
        echo ""
        echo -e "${YELLOW}⚠️  Some integrity checks failed. Review before proceeding.${NC}"
    fi
}

# =============================================================================
# Main Script
# =============================================================================

print_header

# Step 1: Display current state
echo -e "${CYAN}📍 Current State:${NC}"
CURRENT_COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
echo "  Current commit: $CURRENT_COMMIT"

if [[ -z "$TARGET_COMMIT" ]]; then
    TARGET_COMMIT=$(git rev-parse --short HEAD~1 2>/dev/null || echo "unknown")
fi
echo "  Target commit:  $TARGET_COMMIT"
echo ""

# Step 2: Show recent deployments
echo -e "${CYAN}📜 Recent deployments:${NC}"
if [[ -f ".deployments.log" ]]; then
    tail -5 .deployments.log | while read -r line; do
        echo "  $line"
    done
else
    echo "  No deployment history found"
fi
echo ""

# Step 3: Dry run if not confirmed
if [[ "$CONFIRM" != "true" ]]; then
    echo -e "${YELLOW}⚠️  DRY RUN MODE - No changes will be made${NC}"
    echo ""
    echo "This rollback would:"
    echo "  1. Collect reconciliation evidence"
    echo "  2. Activate master kill switch (disable realtime)"
    echo "  3. Roll back to commit: $TARGET_COMMIT"
    echo "  4. Run integrity checks"
    echo "  5. Log rollback action"
    echo ""
    echo "To execute rollback, run:"
    echo -e "  ${GREEN}./scripts/deploy/rollback.sh --confirm --to=$TARGET_COMMIT${NC}"
    echo ""
    exit 0
fi

# Step 4: Authorization confirmation
echo -e "${RED}============================================================${NC}"
echo -e "${RED} ⚠️  ROLLBACK CONFIRMATION REQUIRED${NC}"
echo -e "${RED}============================================================${NC}"
echo ""
echo "You are about to roll back production."
echo ""
echo "Please confirm:"
echo "  1. You have incident commander approval"
echo "  2. You understand this affects production traffic"
echo "  3. You are prepared to monitor post-rollback"
echo ""
read -p "Type 'ROLLBACK' to proceed: " confirmation

if [[ "$confirmation" != "ROLLBACK" ]]; then
    echo -e "${YELLOW}Rollback cancelled.${NC}"
    exit 1
fi

echo ""

# Step 5: Collect reconciliation evidence FIRST
if [[ "$SKIP_RECONCILE" != "true" ]]; then
    collect_reconciliation
else
    echo -e "${YELLOW}⚠️  Skipping reconciliation (--skip-reconcile)${NC}"
fi
echo ""

# Step 6: Activate kill switch
toggle_kill_switch
echo ""

# Step 7: Execute rollback
echo -e "${CYAN}🔄 Executing rollback...${NC}"

# Option A: Git-based rollback (rebuild and deploy)
echo "  Checking out $TARGET_COMMIT..."
git checkout "$TARGET_COMMIT" -- . 2>/dev/null || {
    echo -e "${RED}  ❌ Failed to checkout target commit${NC}"
    echo "  Try manual rollback via Vercel dashboard"
    exit 1
}

# Option B: Vercel CLI rollback (if available)
if command -v vercel &> /dev/null; then
    echo "  Rebuilding application..."
    npm run build 2>&1 | tail -5
    
    echo "  Deploying rollback to production..."
    vercel --prod --yes 2>&1 | tail -3
    
    echo -e "  ${GREEN}✓ Rollback deployment initiated${NC}"
else
    echo -e "${YELLOW}  ⚠️  Vercel CLI not available${NC}"
    echo "  Manual steps required:"
    echo "    1. Go to Vercel dashboard"
    echo "    2. Find deployment for commit $TARGET_COMMIT"
    echo "    3. Promote to production"
fi
echo ""

# Step 8: Run integrity checks
run_integrity_checks
echo ""

# Step 9: Log rollback action
echo -e "${CYAN}📝 Logging rollback...${NC}"
{
    echo "{\"action\": \"rollback\", \"from\": \"$CURRENT_COMMIT\", \"to\": \"$TARGET_COMMIT\", \"timestamp\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\", \"evidence_file\": \"$ROLLBACK_LOG\"}"
} >> .deployments.log
echo "  ✓ Rollback logged"
echo ""

# Step 10: Post-rollback instructions
echo -e "${GREEN}============================================================${NC}"
echo -e "${GREEN} ✅ ROLLBACK COMPLETE${NC}"
echo -e "${GREEN}============================================================${NC}"
echo ""
echo "Next steps:"
echo "  1. Monitor production for 30 minutes"
echo "  2. Verify core functionality:"
echo "     - GPS tracking working"
echo "     - Payments processing"
echo "     - User logins functioning"
echo "  3. Run reconciliation job:"
echo -e "     ${CYAN}npm run cron:reconcile -- --force${NC}"
echo "  4. Create incident report with:"
echo "     - Timeline of events"
echo "     - Root cause analysis"
echo "     - Prevention measures"
echo ""
echo "Evidence collected: $ROLLBACK_LOG"
echo "Deployment log: .deployments.log"
echo ""
