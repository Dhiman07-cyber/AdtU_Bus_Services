# Firestore Monitoring & Alerting

## Overview

This document outlines the recommended monitoring setup for Firestore Spark plan safety.

## Key Metrics to Monitor

### 1. Reads Per Minute (`firestore_reads_per_minute`)
- **Source**: Firebase Console > Firestore > Usage
- **Threshold**: > 50 reads/min → Page on-call
- **Why**: Detects sudden spikes that could exhaust daily quota

### 2. Reads Per Day (`firestore_reads_per_day`)
- **Source**: Firebase Console > Firestore > Usage
- **Threshold**: > 40,000 reads/day → Email admin
- **Why**: Early warning before hitting 50k Spark limit

### 3. Top Document Write Rates
- **Source**: Firebase Console > Firestore > Usage > Top collections
- **Watch for**: Any single document with > 10 writes/minute
- **Why**: Hot spots can indicate runaway listeners

### 4. Active Listeners Count
- **Source**: Custom client-side metric (see implementation below)
- **Threshold**: > 100 concurrent listeners → Warning
- **Why**: Each listener consumes quota on every change

## Client-Side Metrics Implementation

Add this to your app to track active listeners:

```typescript
// src/lib/monitoring/listener-metrics.ts
class ListenerMetrics {
  private activeListeners = new Map<string, number>();
  
  register(name: string): void {
    const count = this.activeListeners.get(name) || 0;
    this.activeListeners.set(name, count + 1);
    this.report();
  }
  
  unregister(name: string): void {
    const count = this.activeListeners.get(name) || 1;
    this.activeListeners.set(name, Math.max(0, count - 1));
    this.report();
  }
  
  private report(): void {
    const total = Array.from(this.activeListeners.values()).reduce((a, b) => a + b, 0);
    if (total > 100) {
      console.warn(`[ALERT] High listener count: ${total}`);
    }
  }
  
  getSnapshot(): Record<string, number> {
    return Object.fromEntries(this.activeListeners);
  }
}

export const listenerMetrics = new ListenerMetrics();
```

## Firebase Console Alerts

### Setting Up Budget Alerts

1. Go to Firebase Console > Project Settings > Usage and Billing
2. Click "Create Budget"
3. Set budget to $0 (Spark plan is free)
4. Add alert thresholds:
   - 50% (25,000 reads/day)
   - 75% (37,500 reads/day)
   - 90% (45,000 reads/day)

### Manual Monitoring Checklist

Daily:
- [ ] Check Firestore Usage dashboard
- [ ] Verify reads are under 40k/day
- [ ] Review any error spikes

Weekly:
- [ ] Run load test: `node loadtests/firestore_reads_safety_test.js`
- [ ] Review listener metrics from client logs
- [ ] Check for any new onSnapshot usage in PRs

## Emergency Procedures

### If Approaching Quota Limit

1. **Immediate**: Set `NEXT_PUBLIC_ENABLE_FIRESTORE_REALTIME=false` in Vercel env vars
2. **Deploy**: Trigger a new deployment to apply the change
3. **Verify**: Check that listeners have switched to polling mode

### Rollback Command

```bash
# Set environment variable in Vercel
vercel env add NEXT_PUBLIC_ENABLE_FIRESTORE_REALTIME production
# Enter: false

# Trigger re-deploy
vercel --prod
```

## Quota Math Reference

See [PR: hardening/firestore-spark-zero-risk] for detailed calculations.

### Quick Reference Table

| Component | Reads/Day | Notes |
|-----------|-----------|-------|
| Student bus status (500 users) | ~4,000 | Single-doc listeners |
| Student profile views | ~500 | On-demand only |
| Bus status updates | ~2,500 | 5 updates × 15 buses × 30 students |
| Admin pagination (20 users) | ~2,000 | 50 docs × 2 sessions × 2 refreshes |
| Notifications (all users) | ~3,000 | User-scoped, limited |
| System signal polling | ~3,600 | 30s interval × admin sessions |
| Reconnect overhead (20%) | ~3,000 | Network jitter buffer |
| **TOTAL (base)** | ~18,600 | Before jitter multiplier |
| **TOTAL (×1.5 jitter)** | ~27,900 | Conservative estimate |
| **Safety margin** | ~12,100 | Under 40k target |

## Contact

For quota-related emergencies, contact the infrastructure team.
