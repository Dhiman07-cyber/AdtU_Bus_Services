/**
 * Unit Tests: FCM Notification Service
 * 
 * Run: npx vitest run src/lib/services/__tests__/fcm-notification-service.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mocks ──────────────────────────────────────────────────────────

const {
  mockRunTransaction,
  mockCollectionFn,
  mockSendEachForMulticast,
  mockSendTopic,
  mockGetValidTokensForBus,
  mockGetValidTokensForRoute,
  mockDeleteTokenByPath,
} = vi.hoisted(() => ({
  mockRunTransaction: vi.fn(),
  mockCollectionFn: vi.fn(),
  mockSendEachForMulticast: vi.fn(),
  mockSendTopic: vi.fn(),
  mockGetValidTokensForBus: vi.fn(),
  mockGetValidTokensForRoute: vi.fn(),
  mockDeleteTokenByPath: vi.fn(),
}));

// Deep chainable mock for Firestore document chains
function chain(): any {
  return {
    get: vi.fn().mockResolvedValue({ exists: false, data: () => null, id: 'x' }),
    set: vi.fn().mockResolvedValue(undefined),
    update: vi.fn().mockResolvedValue(undefined),
    delete: vi.fn().mockResolvedValue(undefined),
    collection: vi.fn().mockImplementation(() => ({
      doc: vi.fn().mockImplementation(() => chain()),
      where: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }) }),
    })),
    doc: vi.fn().mockImplementation(() => chain()),
    where: vi.fn().mockReturnValue({ get: vi.fn().mockResolvedValue({ docs: [], empty: true, size: 0 }) }),
  };
}

vi.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: (...args: any[]) => mockCollectionFn(...args),
    runTransaction: (fn: any) => mockRunTransaction(fn),
    doc: () => chain(),
  },
  messaging: {
    sendEachForMulticast: (...args: any[]) => mockSendEachForMulticast(...args),
    send: (...args: any[]) => mockSendTopic(...args),
  },
  FieldValue: {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
    delete: () => 'DELETE_FIELD',
  },
}));

vi.mock('../fcm-token-service', () => ({
  getValidTokensForBus: (...args: any[]) => mockGetValidTokensForBus(...args),
  getValidTokensForRoute: (...args: any[]) => mockGetValidTokensForRoute(...args),
  deleteTokenByPath: (...args: any[]) => mockDeleteTokenByPath(...args),
}));

import { notifyRoute, verifyDriverRouteBinding } from '../fcm-notification-service';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function tok(id: string, studentId = 's1', path = 'students/s1/tokens/h1') {
  return { token: `tok_${id}`.padEnd(150, '0'), platform: 'web', studentId, tokenDocPath: path };
}

function okResp(n: number) {
  return { successCount: n, failureCount: 0, responses: Array(n).fill({ success: true }) };
}

function mixResp(items: Array<{ ok: boolean; code?: string }>) {
  return {
    successCount: items.filter(i => i.ok).length,
    failureCount: items.filter(i => !i.ok).length,
    responses: items.map(i => i.ok
      ? { success: true }
      : { success: false, error: { code: i.code || 'unknown', message: 'err' } }),
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('FCM Notification Service', () => {
  beforeEach(() => {
    // Reset all mocks completely
    mockRunTransaction.mockReset();
    mockCollectionFn.mockReset();
    mockSendEachForMulticast.mockReset();
    mockSendTopic.mockReset();
    mockGetValidTokensForBus.mockReset();
    mockGetValidTokensForRoute.mockReset();
    mockDeleteTokenByPath.mockReset();

    // Default implementations
    mockRunTransaction.mockImplementation(async (fn: any) => {
      return fn({
        get: vi.fn().mockResolvedValue({ exists: false, data: () => null }),
        set: vi.fn(), update: vi.fn(),
      });
    });

    mockCollectionFn.mockImplementation(() => chain());
    mockGetValidTokensForBus.mockImplementation(async () => []);
    mockGetValidTokensForRoute.mockImplementation(async () => []);
    mockDeleteTokenByPath.mockImplementation(async () => undefined);
    mockSendEachForMulticast.mockImplementation(async () => okResp(0));
    mockSendTopic.mockImplementation(async () => 'msg-id');
  });

  describe('notifyRoute', () => {
    it('returns zero counts when no tokens found', async () => {
      const r = await notifyRoute({ routeId: 'r1', tripId: 't1', routeName: 'R', busId: 'b1' });
      expect(r.success).toBe(true);
      expect(r.totalTokens).toBe(0);
      expect(mockSendEachForMulticast).not.toHaveBeenCalled();
    });

    it('sends to all tokens in single batch', async () => {
      const tokens = [tok('a', 's1', 'p1'), tok('b', 's2', 'p2'), tok('c', 's3', 'p3')];
      mockGetValidTokensForBus.mockImplementation(async () => tokens);
      mockSendEachForMulticast.mockImplementation(async () => okResp(3));

      const r = await notifyRoute({ routeId: 'r1', tripId: 't2', routeName: 'Route', busId: 'b1' });

      expect(r.successCount).toBe(3);
      expect(r.batchCount).toBe(1);
      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);

      const msg = mockSendEachForMulticast.mock.calls[0][0];
      expect(msg.notification).toBeDefined();
      expect(msg.android.priority).toBe('high');
      expect(msg.webpush).toBeDefined();
      expect(msg.apns).toBeDefined();
      expect(msg.data.type).toBe('TRIP_STARTED');
    });

    it('batches sends for >500 tokens', async () => {
      const tokens = Array.from({ length: 1200 }, (_, i) => tok(`${i}`, `s${i}`, `p${i}`));
      mockGetValidTokensForBus.mockImplementation(async () => tokens);

      let callCount = 0;
      mockSendEachForMulticast.mockImplementation(async (msg: any) => {
        callCount++;
        return okResp(msg.tokens.length);
      });

      const r = await notifyRoute({ routeId: 'r1', tripId: 't3', routeName: 'R', busId: 'b1' });

      expect(r.totalTokens).toBe(1200);
      expect(r.successCount).toBe(1200);
      expect(r.batchCount).toBe(3);
      expect(callCount).toBe(3);
    });

    it('removes invalid tokens on not-registered errors', async () => {
      const tokens = [
        tok('v1', 's1', 'students/s1/tokens/h1'),
        tok('bad1', 's2', 'students/s2/tokens/h2'),
        tok('v2', 's3', 'students/s3/tokens/h3'),
        tok('bad2', 's4', 'students/s4/tokens/h4'),
      ];
      mockGetValidTokensForBus.mockImplementation(async () => tokens);
      mockSendEachForMulticast.mockImplementation(async () => mixResp([
        { ok: true },
        { ok: false, code: 'messaging/registration-token-not-registered' },
        { ok: true },
        { ok: false, code: 'messaging/invalid-registration-token' },
      ]));

      const r = await notifyRoute({ routeId: 'r1', tripId: 't4', routeName: 'R', busId: 'b1' });

      expect(r.successCount).toBe(2);
      expect(r.failureCount).toBe(2);
      expect(r.invalidTokensRemoved).toBe(2);
      expect(mockDeleteTokenByPath).toHaveBeenCalledWith('students/s2/tokens/h2');
      expect(mockDeleteTokenByPath).toHaveBeenCalledWith('students/s4/tokens/h4');
    });

    it('prevents duplicate sends via idempotency guard', async () => {
      // First: no prior notification 
      mockRunTransaction.mockImplementationOnce(async (fn: any) =>
        fn({ get: vi.fn().mockResolvedValue({ exists: false, data: () => null }), set: vi.fn(), update: vi.fn() })
      );
      mockGetValidTokensForBus.mockImplementation(async () => [tok('x')]);
      mockSendEachForMulticast.mockImplementation(async () => okResp(1));

      const r1 = await notifyRoute({ routeId: 'r1', tripId: 't5', routeName: 'R', busId: 'b1' });
      expect(r1.successCount).toBe(1);

      // Second: notificationSent = true → blocks
      mockRunTransaction.mockImplementationOnce(async (fn: any) =>
        fn({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ notificationSent: true }) }), set: vi.fn(), update: vi.fn() })
      );

      const r2 = await notifyRoute({ routeId: 'r1', tripId: 't5', routeName: 'R', busId: 'b1' });
      expect(r2.error).toBe('already_sent');
      expect(r2.successCount).toBe(0);
    });

    it('retries transient errors', async () => {
      mockGetValidTokensForBus.mockImplementation(async () => [tok('a', 's1', 'p1'), tok('b', 's2', 'p2')]);

      let call = 0;
      mockSendEachForMulticast.mockImplementation(async () => {
        call++;
        if (call === 1) {
          return mixResp([{ ok: true }, { ok: false, code: 'messaging/server-unavailable' }]);
        }
        return okResp(1);
      });

      const r = await notifyRoute({ routeId: 'r1', tripId: 't6', routeName: 'R', busId: 'b1' });

      expect(r.successCount).toBe(2);
      expect(r.failureCount).toBe(0);
    });

    it('includes notification + data payloads for background delivery', async () => {
      mockGetValidTokensForBus.mockImplementation(async () => [tok('z')]);
      mockSendEachForMulticast.mockImplementation(async () => okResp(1));

      await notifyRoute({ routeId: 'r1', tripId: 't7', routeName: 'Morning', busId: 'b1' });

      expect(mockSendEachForMulticast).toHaveBeenCalledTimes(1);
      const msg = mockSendEachForMulticast.mock.calls[0][0];
      expect(msg.notification.title).toContain('Bus Journey Started');
      expect(msg.notification.body).toContain('Morning');
      expect(msg.data.type).toBe('TRIP_STARTED');
      expect(msg.data.tripId).toBe('t7');
    });

    it('skips idempotency check when flag set', async () => {
      mockGetValidTokensForBus.mockImplementation(async () => [tok('y')]);
      mockSendEachForMulticast.mockImplementation(async () => okResp(1));

      const r = await notifyRoute({ routeId: 'r1', tripId: 't8', routeName: 'R', busId: 'b1', skipIdempotencyCheck: true });

      expect(r.successCount).toBe(1);
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });
  });

  describe('verifyDriverRouteBinding', () => {
    it('authorizes driver assigned to bus', async () => {
      mockCollectionFn.mockImplementation(() => ({
        doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ assignedBusId: 'b1' }) }) }),
      }));
      expect((await verifyDriverRouteBinding('d1', 'r1', 'b1')).authorized).toBe(true);
    });

    it('rejects unassigned driver', async () => {
      let callN = 0;
      mockCollectionFn.mockImplementation(() => {
        callN++;
        if (callN === 1) {
          return { doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ assignedBusId: 'other' }) }) }) };
        }
        return { doc: () => ({ get: vi.fn().mockResolvedValue({ exists: true, data: () => ({ assignedDriverId: 'x', activeDriverId: 'x', driverUID: 'x' }) }) }) };
      });
      expect((await verifyDriverRouteBinding('d1', 'r1', 'b1')).authorized).toBe(false);
    });

    it('rejects when driver not found', async () => {
      mockCollectionFn.mockImplementation(() => ({
        doc: () => ({ get: vi.fn().mockResolvedValue({ exists: false, data: () => null }) }),
      }));
      const r = await verifyDriverRouteBinding('unk', 'r1', 'b1');
      expect(r.authorized).toBe(false);
      expect(r.reason).toContain('not found');
    });
  });
});
