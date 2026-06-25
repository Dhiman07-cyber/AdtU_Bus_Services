/**
 * Tests for the canonical transport-entitlement source of truth (Phase 3).
 * ────────────────────────────────────────────────────────────────────────
 * Run: npm test -- src/lib/__tests__/transport-entitlement.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  getTransportEntitlement,
  hasTransportEntitlement,
  toDate,
} from '../entitlement/transport-entitlement';

const NOW = new Date('2026-06-24T12:00:00.000Z');
const FUTURE = new Date('2026-09-01T00:00:00.000Z').toISOString();
const PAST = new Date('2026-01-01T00:00:00.000Z').toISOString();

describe('getTransportEntitlement', () => {
  it('grants an active student within the soft-block boundary', () => {
    const r = getTransportEntitlement({ status: 'active', softBlock: FUTURE, validUntil: FUTURE }, NOW);
    expect(r).toEqual({ entitled: true, reason: 'entitled' });
  });

  it('grants during the grace window: validUntil passed but softBlock still ahead', () => {
    // Phase-1 consistency: entitlement persists until soft-block, not validUntil.
    const r = getTransportEntitlement({ status: 'active', softBlock: FUTURE, validUntil: PAST }, NOW);
    expect(r.entitled).toBe(true);
    expect(r.reason).toBe('entitled');
  });

  it('denies once past the stored soft-block boundary', () => {
    const r = getTransportEntitlement({ status: 'active', softBlock: PAST, validUntil: PAST }, NOW);
    expect(r).toEqual({ entitled: false, reason: 'past_soft_block' });
  });

  it('denies any non-active status regardless of dates', () => {
    for (const status of ['soft_blocked', 'hard_blocked', 'pending_deletion', 'suspended', 'inactive']) {
      const r = getTransportEntitlement({ status, softBlock: FUTURE, validUntil: FUTURE }, NOW);
      expect(r).toEqual({ entitled: false, reason: 'inactive_status' });
    }
  });

  it('does NOT consult seatReleasedAt: a stale marker on an active student still grants', () => {
    const r = getTransportEntitlement(
      { status: 'active', softBlock: FUTURE, seatReleasedAt: PAST } as any,
      NOW
    );
    expect(r.entitled).toBe(true);
  });

  it('LEGACY: active + missing softBlock + valid validUntil → granted via fallback', () => {
    const r = getTransportEntitlement({ status: 'active', validUntil: FUTURE }, NOW);
    expect(r).toEqual({ entitled: true, reason: 'entitled' });
  });

  it('LEGACY: active + missing softBlock + expired validUntil → expired', () => {
    const r = getTransportEntitlement({ status: 'active', validUntil: PAST }, NOW);
    expect(r).toEqual({ entitled: false, reason: 'expired' });
  });

  it('LEGACY SAFETY: active + NO date fields at all → granted (never deny on incomplete data)', () => {
    const r = getTransportEntitlement({ status: 'active' }, NOW);
    expect(r).toEqual({ entitled: true, reason: 'entitled_legacy_incomplete' });
  });

  it('denies a null / missing student', () => {
    expect(getTransportEntitlement(null, NOW)).toEqual({ entitled: false, reason: 'no_account' });
    expect(getTransportEntitlement(undefined, NOW)).toEqual({ entitled: false, reason: 'no_account' });
  });

  it('handles Firestore Timestamp-shaped softBlock ({ seconds })', () => {
    const seconds = Math.floor(new Date(FUTURE).getTime() / 1000);
    const r = getTransportEntitlement({ status: 'active', softBlock: { seconds } } as any, NOW);
    expect(r.entitled).toBe(true);
  });

  it('hasTransportEntitlement mirrors getTransportEntitlement.entitled', () => {
    const s = { status: 'active', softBlock: FUTURE };
    expect(hasTransportEntitlement(s, NOW)).toBe(getTransportEntitlement(s, NOW).entitled);
  });
});

describe('toDate', () => {
  it('parses ISO strings, Dates, ms numbers, and Firestore shapes; null otherwise', () => {
    expect(toDate(FUTURE)?.toISOString()).toBe(FUTURE);
    expect(toDate(new Date(FUTURE))?.toISOString()).toBe(FUTURE);
    expect(toDate({ toDate: () => new Date(FUTURE) })?.toISOString()).toBe(FUTURE);
    expect(toDate(null)).toBeNull();
    expect(toDate('')).toBeNull();
    expect(toDate('not-a-date')).toBeNull();
  });
});
