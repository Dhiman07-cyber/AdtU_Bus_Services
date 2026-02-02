#!/bin/bash
# =============================================================================
# Database Migration Script
# ADTU Smart Bus Management System
# =============================================================================
# Usage: ./scripts/deploy/migrate.sh [--dry-run] [--env=staging|production]
# =============================================================================

set -euo pipefail

DRY_RUN=false
ENV="staging"

# Parse arguments
for arg in "$@"; do
    case $arg in
        --dry-run)
            DRY_RUN=true
            shift
            ;;
        --env=*)
            ENV="${arg#*=}"
            shift
            ;;
    esac
done

echo "🗄️  Database Migration - Environment: $ENV"
echo "   Dry run: $DRY_RUN"
echo "============================================="

# Check Supabase CLI
if ! command -v supabase >/dev/null 2>&1; then
    echo "⚠️  Supabase CLI not installed. Install with:"
    echo "   npm install -g supabase"
    exit 1
fi

# Set database URL based on environment
if [[ "$ENV" == "production" ]]; then
    DB_URL="${SUPABASE_DB_URL:-}"
else
    DB_URL="${SUPABASE_STAGING_DB_URL:-$SUPABASE_DB_URL}"
fi

if [[ -z "$DB_URL" ]]; then
    echo "❌ Database URL not configured for $ENV"
    echo "   Set SUPABASE_DB_URL or SUPABASE_STAGING_DB_URL"
    exit 1
fi

# List pending migrations
echo "📋 Pending migrations:"
if [[ -d "supabase/migrations" ]]; then
    for migration in supabase/migrations/*.sql; do
        if [[ -f "$migration" ]]; then
            echo "   - $(basename "$migration")"
        fi
    done
else
    echo "   No migrations found"
    exit 0
fi

if [[ "$DRY_RUN" == "true" ]]; then
    echo ""
    echo "🔍 DRY RUN - Validating migrations..."
    
    # Validate SQL syntax (basic check)
    for migration in supabase/migrations/*.sql; do
        if [[ -f "$migration" ]]; then
            echo "   Validating: $(basename "$migration")"
            # Check for potentially dangerous operations
            if grep -qi "DROP TABLE\|TRUNCATE\|DELETE FROM.*WHERE 1=1" "$migration"; then
                echo "   ⚠️  WARNING: Destructive operation detected in $(basename "$migration")"
            fi
        fi
    done
    
    echo ""
    echo "✅ Dry run complete - no changes applied"
    echo "   Run without --dry-run to apply migrations"
else
    echo ""
    echo "🚀 Applying migrations to $ENV..."
    
    # Create backup point marker
    BACKUP_MARKER=$(date +%Y%m%d_%H%M%S)
    echo "   Backup marker: $BACKUP_MARKER"
    
    # Run Supabase migrations
    supabase db push --db-url "$DB_URL"
    
    echo ""
    echo "✅ Migrations applied successfully"
fi

echo "============================================="
