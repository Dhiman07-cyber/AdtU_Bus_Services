# 🚀 ADTU Smart Bus Management System — Production Runbook

> **Version:** 1.0  
> **Last Updated:** 2026-02-01  
> **Status:** Ready for immediate execution  
> **Target Teams:** SRE, Security, Dev, DBA, FinOps, QA

A concise, production-grade runbook and actionable checklist for deploying the **ADTU Smart Bus Management System** with secure payments, cryptographically-signed receipts, hybrid Firestore/Supabase architecture, strict RBAC, and observable SRE controls.

---

## 📋 Production Checklist — Top 20 (Priority Order)

**Format:** `Role — Artifact — Acceptance Criteria` _(one-line action + verification)_

### Critical Path (Items 1-10)

| # | Role | Artifact | Action & Acceptance Criteria |
|---|------|----------|------------------------------|
| 1 | **SRE** | KMS/HSM Provisioning | Provision cloud KMS or HSM and import RSA-2048 key; verify key usage via test-sign and that private key is non-exportable. ✅ `sign(receipt) -> verify(signature)` passes and private key export is disabled. |
| 2 | **Sec** | Secrets Policy & Rotation | Implement secret injection (Vault/GCP Secret Manager/AWS Secrets Manager) with 30-day rotation policy and audit logs enabled. ✅ Rotation job runs; rotate secret → services continue with zero downtime. |
| 3 | **Dev** | Idempotent Payment Flow | Enforce `operationId` at API gateway + server verify Razorpay webhook signature; reconcile job flagging mismatches. ✅ Payment replay test returns idempotent result; reconciliation job shows zero unresolved in first run. |
| 4 | **SRE/Dev** | Least-Privilege IAM Roles | Create RBAC roles for Admin/Moderator/Driver/Student and service principals with short-lived tokens. ✅ Role matrix enforced by policy unit tests; token TTL ≤ 1h for services. |
| 5 | **Sec** | MFA & Admin Hardening | Enforce MFA + device posture for Admins and Moderators and disable password-only logins. ✅ 100% of admin accounts require MFA on login attempt. |
| 6 | **Dev/Sec** | Audit Trail Implementation | Immutable append-only audit store in Supabase ledger (or append-only DB) capturing UID, action, timestamp, pre/post diff, signed hash chain. ✅ Mutate test entry → audit record exists with diff and tamper-evident hash. |
| 7 | **SRE** | Master Kill Switch & Quota Safeguards | Implement `ENABLE_FIRESTORE_REALTIME` feature flag; fallback polling (10-min) and alert on listener count. ✅ Toggle OFF → listeners shut down and polling resumes; alert fires on >75% quota. |
| 8 | **Dev** | Server-only Crypto Ops | Move all signature generation and verification to server-side functions (no client key access). ✅ Client cannot sign receipts; server signs and clients verify via public key only. |
| 9 | **DBA** | Backup & Point-in-Time Recovery | Configure automated daily backups with PITR and test a full restore to staging weekly. ✅ Restore test completes within RTO; data integrity checks pass. |
| 10 | **QA** | Automated Security Tests | Add SAST, SCA, and DAST in pipeline and scheduled dynamic pen-tests before launch. ✅ Zero critical SAST findings; any high/critical blocked until remediated. |

### Secondary Path (Items 11-20)

| # | Role | Artifact | Action & Acceptance Criteria |
|---|------|----------|------------------------------|
| 11 | **Dev** | Input Validation & Escaping | Centralized validation middleware for all user input; XSS/SQL/no-SQL injection mitigations. ✅ Fuzzing + DAST show zero exploitable injection vectors. |
| 12 | **Dev** | GPS Anti-spoofing Controls | Server-side heuristics (velocity checks, improbable jumps, signed device telemetry) + anomaly detection. ✅ Simulated spoofing flagged and auto-throttled; alert created. |
| 13 | **SRE** | Observability & SLOs | Define SLOs (see metrics below), instrument traces, metrics, and logs; configure PagerDuty alerts. ✅ Dashboards show live metrics; alert rules tested by synthetic failures. |
| 14 | **Dev** | Rate Limiting & WAF | API gateway rate-limiting, per-IP and per-user quotas, and web application firewall rules. ✅ Load test exceeding limits returns 429 gracefully; WAF blocks OWASP top rules. |
| 15 | **FinOps/DBA** | Payment Reconciliation Job | Scheduled daily reconciliation between Razorpay ledger and internal ledger with exception handling. ✅ Daily run finishes with 0 unresolved anomalies or created tickets. |
| 16 | **Dev/SRE** | Feature Flags & Canary | Integrate feature flags for rollout; implement canary (5% → 25% → 100%). ✅ Canary metrics meet health thresholds for 30 minutes before expanding. |
| 17 | **Dev** | OperationId Idempotency Tests | Unit + integration tests that replay payment/process requests and assert no duplication. ✅ Replayed requests do not create duplicate records. |
| 18 | **SRE** | Capacity & Load Testing | Simulate peak GPS and listener load (5s updates × fleet size) and validate latency/backpressure behavior. ✅ 95th percentile latency within SLO; no data loss. |
| 19 | **Sec** | Dependency & Supply-chain Controls | SCA scanning, pinned dependency versions, and binary signing for build artifacts. ✅ No critical CVEs unaddressed; reproducible builds. |
| 20 | **Ops** | Runbook & Access Reviews | Publish runbooks (below) and perform access reviews every 30 days. ✅ Runbooks accessible and a completed access review report. |

---

## 🚦 Go / No-Go Gate Checklist

All items must pass before production deployment:

| Gate | Status | Owner |
|------|--------|-------|
| ☐ KMS/HSM provisioned and test-signed | GO only if pass | SRE |
| ☐ All critical SAST/DAST findings remediated | GO only if pass | QA/Sec |
| ☐ Payment idempotency & webhook verification tests pass | GO only if pass | Dev |
| ☐ Audit trail operational and immutable tests pass | GO only if pass | Dev/Sec |
| ☐ Backup & restore tested successfully in staging | GO only if pass | DBA |
| ☐ Canary deployment health passes at 5% & 25% windows | GO to full roll only if pass | SRE |

---

## 🛡️ Security & Threat Cases

| Threat | Likelihood | Impact | Test Case | Mitigation |
|--------|-----------|--------|-----------|------------|
| **Replay / Idempotency attack on payments** | Medium | High (double charge) | Replay payment request with same `operationId` → expect no duplicate ledger entry | Enforce server-side idempotency store; canonicalize `operationId`; block duplicates; reconciliation alerts |
| **Stolen JWT / session tokens** | High | High (account takeover) | Theft simulation: reuse captured JWT post-expiry → should be rejected if token revoked | Short-lived tokens + refresh rotation + token introspection & blacklist on logout/device change + MFA for sensitive ops |
| **Compromised server private key** | Low | Critical (forged receipts) | Simulate private-key theft (privilege escalation test) — verify alerting and inability to export | KMS/HSM non-exportable keys, immediate key rotation playbook, revoke old keys, re-sign receipts policy |
| **Payment double-charge (race)** | Medium | High | Simulate parallel payment flows; race for same `operationId` | Atomic server-side check-and-create with DB constraint; idempotency store; reconcile job |
| **GPS spoofing / false flags** | Medium | Medium | Inject unrealistic coordinates/time → system flags anomalies | Device attestation, velocity/time heuristics, signed telemetry, manual moderation override & rollback |
| **DB rules misconfiguration (Firestore)** | Medium | High | Deploy intentionally permissive rules to staging, run access tests | CI policy-as-code for DB rules, unit tests, gate deployments, least-privilege rules |
| **Privilege escalation by Moderator** | Low | High | Attempt elevation via role change endpoint tests | Enforce server-side RBAC checks, immutable audit log, admin approval workflow for critical changes |
| **Injection / XSS in admin UI** | Medium | High | DAST and manual testing on admin inputs | Central templating/escaping, CSP, SAST/DAST remediation |
| **Supply-chain / dependency compromise** | Medium | High | Use compromised dependency in SCA → detect vulnerability | Use SCA, signed artifacts, ephemeral builds, pinned versions, regular CVE triage |
| **Razorpay webhook forgery** | Low | High | Send forged webhook without correct signature → must be rejected | Validate webhook signature, restrict source IPs if supported, replay protection |

---

## 🔄 CI/CD Deployment & Rollout Recipe

### Pipeline Stages

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Pre-Merge     │───▶│   Merge Gate    │───▶│     Canary      │
│ SAST + SCA +    │    │ Integration +   │    │  5% → 25% →     │
│ Unit Tests      │    │ DB Migration    │    │     100%        │
│ (fail on high)  │    │ Dry-run         │    │                 │
└─────────────────┘    └─────────────────┘    └─────────────────┘
```

### GitHub Actions Workflow

```yaml
name: ci-cd
on: [push]
jobs:
  build-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci && npm test
      - name: SCA/SAST
        run: snyk test || exit 1
        
  deploy-canary:
    needs: build-and-test
    runs-on: ubuntu-latest
    steps:
      - run: ./scripts/iac-plan.sh
      - run: ./scripts/migrate --dry-run
      - run: ./scripts/deploy --env=canary --flag=5%
      - run: ./scripts/health-checks
```

### Secrets Management

- Inject secrets via environment from Vault/KMS in runner
- **NEVER** store secrets in repository
- Use `${{ secrets.* }}` for GitHub Actions
- Rotate service account keys on 30-day cycle

### Rollback Criteria

| Condition | Action |
|-----------|--------|
| Canary error rate > 3× baseline for 10 mins | **Immediate rollback** |
| Payment reconciliation failures > 0.5% | **Immediate rollback** |

**Rollback Steps:**
1. Set feature flag to previous version
2. Redeploy previous stable image
3. Run integrity checks
4. Re-run reconciliation job

---

## 🚨 Incident Playbooks (6 Critical Scenarios)

**Format:** Detection → Immediate Actions (first 15 min) → Mitigation (next actions) → Postmortem checklist

---

### Playbook 1: Database Corruption / Destructive Write

#### 🔍 Detection
- Unexpected schema errors
- Checksum mismatches
- High error rates on reads
- Failed integrity checks

#### ⚡ Immediate Actions (0-15 min)
1. **Quarantine writes** — Enable read-only mode immediately
2. **Trigger backup restore job** to staging environment
3. **Notify** SRE/DBA + Incident Lead via PagerDuty

#### 🔧 Mitigation
1. Restore latest clean snapshot to staging
2. Diff restore vs production to identify missing data
3. Apply replayed safe writes or manual reconciliation
4. Gradual traffic restoration after verification

#### 📋 Postmortem Checklist
- [ ] Complete timeline of events
- [ ] Root cause analysis
- [ ] Review missed alerts
- [ ] Document restore time vs RTO
- [ ] Update backup frequency if needed
- [ ] Add pre-commit schema checks

---

### Playbook 2: Payment Double-Charge / Reconciliation Failure

#### 🔍 Detection
- Reconciliation job reports duplicate/unmatched transactions
- User reports double charge
- Anomaly in payment success ratio

#### ⚡ Immediate Actions (0-15 min)
1. **Put payment gateway integration in read-only mode**
2. **Pause auto-renewals** and new payment processing
3. **Create high-priority ticket** with user impact list

#### 🔧 Mitigation
1. Use idempotency store to identify all duplicates
2. Refund or credit affected users per compensation policy
3. Patch race condition in payment flow
4. Redeploy with fix and expanded test coverage

#### 📋 Postmortem Checklist
- [ ] Map all duplicate transaction flows
- [ ] Fix idempotency enforcement gaps
- [ ] Add replay test harness
- [ ] Document compensation policy applied
- [ ] Review operationId generation logic

---

### Playbook 3: Private Key Compromise (KMS/HSM Suspicious Activity)

#### 🔍 Detection
- KMS audit shows suspicious access patterns
- Unauthorized key usage attempts
- Key export attempt alerts

#### ⚡ Immediate Actions (0-15 min)
1. **Revoke or disable compromised key** — Rotate to new key immediately
2. **Suspend issuance of new receipts** until new key active
3. **Notify Security & Legal teams**

#### 🔧 Mitigation
1. Rotate all cryptographic keys
2. Re-sign critical artifacts where feasible
3. Revoke any sessions tied to old keys
4. Assess scope of signed receipts and notify stakeholders
5. Conduct forensic analysis of access logs

#### 📋 Postmortem Checklist
- [ ] Complete KMS access audit
- [ ] Review all IAM permissions
- [ ] Implement stricter KMS policies
- [ ] Rotate any affected downstream secrets
- [ ] Update key rotation procedures

---

### Playbook 4: Service DoS / Quota Exhaustion (Firestore Spark / Supabase)

#### 🔍 Detection
- Sudden spike in requests
- Listener count > threshold alerts
- Quota warnings from provider dashboards

#### ⚡ Immediate Actions (0-15 min)
1. **Activate `ENABLE_FIRESTORE_REALTIME` = false** (Master Kill Switch)
2. **Enable aggressive rate-limits** and backpressure
3. **Scale services** if autoscaling available

#### 🔧 Mitigation
1. Throttle non-critical clients
2. Apply WAF rules to block abusive patterns
3. Block identified abusive IP ranges
4. Engage provider support for quota relief
5. Enable fallback polling mode

#### 📋 Postmortem Checklist
- [ ] Refine quota thresholds
- [ ] Adjust autoscaling parameters
- [ ] Add synthetic load tests
- [ ] Improve client backoff logic
- [ ] Review listener lifecycle management

---

### Playbook 5: GPS Spoofing / False-Flagging Attack

#### 🔍 Detection
- Multiple improbable location jumps (velocity > 200 km/h between updates)
- Impossible coordinate transitions
- Inconsistent device telemetry signatures

#### ⚡ Immediate Actions (0-15 min)
1. **Mark affected feeds as suspicious** — Route to moderation queue
2. **Notify driver/dispatcher** via alternate channel (SMS/call)
3. **Disable auto-accept logic** for flagged stops

#### 🔧 Mitigation
1. Block or rate-limit affected device feed
2. Trigger device attestation check
3. Force driver confirmation before accepting waiting flags
4. Manual override for affected route operations

#### 📋 Postmortem Checklist
- [ ] Improve velocity/location heuristics
- [ ] Add signed telemetry and device attestation
- [ ] Update user guidance for GPS issues
- [ ] Review anti-spoofing detection thresholds

---

### Playbook 6: Lost / Compromised Admin Credentials

#### 🔍 Detection
- Admin login from unfamiliar geo/device
- Unusual admin action patterns
- MFA bypass attempts (if detected)

#### ⚡ Immediate Actions (0-15 min)
1. **Revoke all admin sessions** — Force password reset + MFA re-enrollment
2. **Lock affected admin account** immediately
3. **Trigger audit of admin actions** in last 24-48h

#### 🔧 Mitigation
1. Roll back any unsafe admin changes using audit diffs
2. Rotate all service tokens if accessed by that admin
3. Conduct mandatory credential hygiene training for team
4. Review all privilege grants made by compromised account

#### 📋 Postmortem Checklist
- [ ] Evaluate access approval process
- [ ] Tighten MFA enforcement policies
- [ ] Schedule recurring credential audits (30-day cycle)
- [ ] Review admin action logging completeness

---

## 📊 Observability & Primary SLOs

### Key Metrics & Targets

| Metric | Target | Alert Threshold |
|--------|--------|-----------------|
| **Payment Success Rate** | ≥ 99.9% per day | < 99.5% |
| **GPS Freshness** | ≥ 95% updates within 10s of 5s cadence | < 90% |
| **API Error Rate** | < 0.5% | > 1% |
| **API p95 Latency** | < 300ms | > 500ms |
| **Payment Reconciliation Delay** | Daily job < 15 minutes | > 30 minutes |
| **Audit Immutability** | ≥ 99.99% coverage for mutations | Any gap detected |

### Dashboard Requirements

- [ ] Real-time payment transaction flow
- [ ] GPS update heatmap by bus/route
- [ ] Firestore quota usage gauge
- [ ] Active listener count
- [ ] Error rate by endpoint
- [ ] Latency percentiles (p50, p95, p99)

### Alert Configuration

```yaml
# Example PagerDuty alert rules
alerts:
  - name: payment_success_rate_low
    condition: payment_success_rate < 99.5%
    duration: 5m
    severity: critical
    
  - name: firestore_quota_warning
    condition: firestore_read_quota_used > 75%
    severity: warning
    
  - name: api_latency_high
    condition: api_p95_latency > 500ms
    duration: 10m
    severity: high
```

---

## 🔒 Final Operational Constraints (Enforced)

These constraints are **non-negotiable** for production:

1. **🔐 Cryptography:** All cryptographic ops in KMS/HSM; no private keys in repo or client
2. **💳 Payments:** Payment flow must be idempotent with `operationId`; webhooks validated with signature
3. **👥 Access Control:** RBAC + MFA mandatory for Admin/Moderator roles
4. **🔍 Security Testing:** Automated SAST/DAST as pre-merge gates; pen-test before prod launch
5. **💾 Backups:** Backups + PITR verified weekly; documented recovery RTO/RPO

---

## 📚 Quick Reference Commands

### Emergency Actions

```bash
# Master Kill Switch - Disable realtime listeners
export ENABLE_FIRESTORE_REALTIME=false

# Force reconciliation run
npm run cron:reconcile -- --force

# Check current quota usage
npm run check:quotas

# Trigger backup restore
./scripts/restore-backup.sh --env=staging --snapshot=latest
```

### Health Checks

```bash
# Full system health check
npm run health:all

# Payment system health
npm run health:payments

# Database connectivity
npm run health:db
```

---

## 📞 Escalation Contacts

| Role | Primary | Backup |
|------|---------|--------|
| SRE Lead | _[Fill in]_ | _[Fill in]_ |
| Security Lead | _[Fill in]_ | _[Fill in]_ |
| Dev Lead | _[Fill in]_ | _[Fill in]_ |
| DBA | _[Fill in]_ | _[Fill in]_ |

---

> **Next Steps:** Hand this checklist to your SRE, Sec, Dev, and DBA teams and run through the Go/No-Go gates. For CLI commands, Terraform snippets, and CI job scripts tailored to your specific cloud provider and CI system, specify your target stack (AWS/GCP/Azure + GitHub Actions/GitLab).
