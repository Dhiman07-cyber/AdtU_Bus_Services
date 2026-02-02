# Test Scripts Directory

This directory contains production-readiness testing scripts for the ADTU Smart Bus Management System.

## Files

| File | Description |
|------|-------------|
| `api_test_suite.sh` | Comprehensive API tests (auth, RBAC, webhooks, idempotency, audit) |
| `k6_gps_load_test.js` | k6 load testing for GPS updates with SLO thresholds |
| `.env.test.example` | Example environment variables (copy to `.env.test`) |

## Quick Start

### 1. Setup Environment

```bash
# Copy example env and fill in your values
cp .env.test.example .env.test

# Edit with your staging environment values
nano .env.test
```

### 2. Run API Tests

```bash
# Make executable
chmod +x api_test_suite.sh

# Run tests against staging
./api_test_suite.sh

# Results saved to: api_test_results.json
```

### 3. Run Load Tests

```bash
# Install k6 if not present
# macOS: brew install k6
# Windows: choco install k6
# Linux: See https://k6.io/docs/getting-started/installation/

# Smoke test (minimal load)
k6 run --env SCENARIO=smoke --env STAGING_URL="https://your-staging.vercel.app" k6_gps_load_test.js

# Load test (normal expected load)
k6 run --env SCENARIO=load k6_gps_load_test.js

# Stress test (push beyond normal)
k6 run --env SCENARIO=stress k6_gps_load_test.js

# Peak test (fleet simulation)
k6 run --env SCENARIO=peak k6_gps_load_test.js
```

## Test Scenarios

### API Test Categories

1. **Health & Connectivity** - Basic application health
2. **Authentication & RBAC** - Role-based access control
3. **Payment Webhook Security** - Signature verification
4. **Payment Idempotency** - Replay attack protection
5. **Audit Trail Verification** - Immutable logging
6. **Rate Limiting** - DoS protection
7. **Input Validation** - XSS/Injection prevention
8. **Kill Switch** - Emergency failover

### k6 Load Test Scenarios

| Scenario | VUs | Duration | Use Case |
|----------|-----|----------|----------|
| `smoke` | 2 | 1 min | Quick sanity check |
| `load` | 10 | 5 min | Normal expected traffic |
| `stress` | 25 | 10 min | Beyond normal capacity |
| `peak` | 50 | 15 min | Peak hour simulation |

## SLO Thresholds

- GPS update p95 latency: < 500ms
- Error rate: < 1%
- Payment success rate: > 99.9%
- API availability: > 99.9%

## Authorization Required

⚠️ **Before running any tests:**

1. Confirm target is a STAGING environment you own/control
2. Obtain written approval if testing shared infrastructure
3. Never run load tests against production without explicit provider consent
4. Configure rate-limit cutoffs appropriately
