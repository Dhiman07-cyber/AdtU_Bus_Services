# ✅ Go/No-Go Checklist (Print-Ready)

**Project:** ADTU Smart Bus Management System  
**Date:** ____________  
**Release Version:** ____________  
**Approver:** ____________

---

## Pre-Production Gates

| # | Category | Check Item | Owner | Status |
|---|----------|------------|-------|--------|
| 1 | **Security** | KMS/HSM provisioned and test-signed | SRE | ☐ GO ☐ NO-GO |
| 2 | **Security** | All critical SAST/DAST findings remediated | QA/Sec | ☐ GO ☐ NO-GO |
| 3 | **Payments** | Payment idempotency tests pass | Dev | ☐ GO ☐ NO-GO |
| 4 | **Payments** | Webhook signature verification tests pass | Dev | ☐ GO ☐ NO-GO |
| 5 | **Audit** | Audit trail operational | Dev/Sec | ☐ GO ☐ NO-GO |
| 6 | **Audit** | Immutability tests pass | Dev/Sec | ☐ GO ☐ NO-GO |
| 7 | **Backup** | Backup tested successfully in staging | DBA | ☐ GO ☐ NO-GO |
| 8 | **Backup** | Restore completed within RTO | DBA | ☐ GO ☐ NO-GO |
| 9 | **Access** | MFA enforced for Admin/Moderator | Sec | ☐ GO ☐ NO-GO |
| 10 | **Access** | RBAC policy tests pass | Dev | ☐ GO ☐ NO-GO |

---

## Canary Deployment Gates

| Phase | Check Item | Threshold | Status |
|-------|------------|-----------|--------|
| **5% Traffic** | Error rate | < 3× baseline | ☐ PASS ☐ FAIL |
| **5% Traffic** | Payment success | > 99.5% | ☐ PASS ☐ FAIL |
| **5% Traffic** | API p95 latency | < 500ms | ☐ PASS ☐ FAIL |
| **5% Traffic** | 30-min observation | Complete | ☐ PASS ☐ FAIL |
| **25% Traffic** | Error rate | < 3× baseline | ☐ PASS ☐ FAIL |
| **25% Traffic** | Payment success | > 99.5% | ☐ PASS ☐ FAIL |
| **25% Traffic** | 30-min observation | Complete | ☐ PASS ☐ FAIL |
| **100% Traffic** | All SLOs met | Per SLO doc | ☐ PASS ☐ FAIL |

---

## Rollback Criteria (Automatic Trigger)

If ANY of these occur → **IMMEDIATE ROLLBACK**:

| Condition | Threshold |
|-----------|-----------|
| ☐ Error rate exceeds | 3× baseline for 10 min |
| ☐ Payment reconciliation failures | > 0.5% |
| ☐ API availability drops | < 99% |
| ☐ Health check failures | > 3 consecutive |

---

## Final Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| SRE Lead | ____________ | ____________ | ____________ |
| Security Lead | ____________ | ____________ | ____________ |
| Dev Lead | ____________ | ____________ | ____________ |
| Product Owner | ____________ | ____________ | ____________ |

---

**Decision:** ☐ **GO FOR PRODUCTION** ☐ **NO-GO (Remediation Required)**

**Notes:**
_____________________________________________________________
_____________________________________________________________
_____________________________________________________________
