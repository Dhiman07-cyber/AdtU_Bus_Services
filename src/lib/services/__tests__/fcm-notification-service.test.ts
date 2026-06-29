import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  mockRunTransaction,
  mockCollectionFn,
  mockSendTopic,
} = vi.hoisted(() => ({
  mockRunTransaction: vi.fn(),
  mockCollectionFn: vi.fn(),
  mockSendTopic: vi.fn(),
}));

function queryChain(docs: Array<{ id: string }> = []) {
  const chain = {
    where: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    get: vi.fn().mockResolvedValue({ docs, empty: docs.length === 0, size: docs.length }),
  };
  return chain;
}

function collectionChain(docData: Record<string, unknown> | null = null) {
  return {
    doc: vi.fn(() => ({
      get: vi.fn().mockResolvedValue({
        exists: docData !== null,
        data: () => docData,
      }),
      update: vi.fn().mockResolvedValue(undefined),
    })),
    where: vi.fn(() => queryChain()),
  };
}

vi.mock('@/lib/firebase-admin', () => ({
  db: {
    collection: (...args: unknown[]) => mockCollectionFn(...args),
    runTransaction: (fn: unknown) => mockRunTransaction(fn),
    batch: () => ({
      update: vi.fn(),
      commit: vi.fn().mockResolvedValue(undefined),
    }),
  },
  messaging: {
    send: (...args: unknown[]) => mockSendTopic(...args),
  },
  FieldValue: {
    serverTimestamp: () => 'SERVER_TIMESTAMP',
  },
}));

import { notifyRoute, verifyDriverRouteBinding } from '../fcm-notification-service';

describe('FCM Notification Service', () => {
  beforeEach(() => {
    mockRunTransaction.mockReset();
    mockCollectionFn.mockReset();
    mockSendTopic.mockReset();

    mockRunTransaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => fn({
      get: vi.fn().mockResolvedValue({
        exists: true,
        data: () => ({ activeTripLock: { tripId: 't1' } }),
      }),
      update: vi.fn(),
    }));
    mockCollectionFn.mockImplementation(() => collectionChain());
    mockSendTopic.mockResolvedValue('msg-id');
  });

  describe('notifyRoute', () => {
    it('sends trip notifications to the route topic', async () => {
      const result = await notifyRoute({ routeId: 'r1', tripId: 't1', routeName: 'Morning', busId: 'b1' });

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.totalTokens).toBe(0);
      expect(result.batchCount).toBe(1);
      expect(mockSendTopic).toHaveBeenCalledTimes(1);

      const message = mockSendTopic.mock.calls[0][0];
      expect(message.topic).toBe('route_r1');
      expect(message.notification.title).toContain('Bus Journey Started');
      expect(message.notification.body).toContain('Morning');
      expect(message.data.type).toBe('TRIP_STARTED');
      expect(message.data.tripId).toBe('t1');
    });

    it('prevents duplicate sends through the bus lock flag', async () => {
      mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => fn({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ activeTripLock: { tripId: 't2', startFcmSent: true } }),
        }),
        update: vi.fn(),
      }));

      const result = await notifyRoute({ routeId: 'r1', tripId: 't2', routeName: 'Morning', busId: 'b1' });

      expect(result.error).toBe('already_sent');
      expect(result.successCount).toBe(0);
      expect(mockSendTopic).not.toHaveBeenCalled();
    });

    it('supports trip-ended topic payloads', async () => {
      mockRunTransaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => fn({
        get: vi.fn().mockResolvedValue({
          exists: true,
          data: () => ({ activeTripLock: { tripId: 't3' } }),
        }),
        update: vi.fn(),
      }));

      const result = await notifyRoute({
        routeId: 'r1',
        tripId: 't3',
        routeName: 'Morning',
        busId: 'b1',
        eventType: 'TRIP_ENDED',
      });

      expect(result.success).toBe(true);
      const message = mockSendTopic.mock.calls[0][0];
      expect(message.notification.title).toContain('Trip Ended');
      expect(message.data.type).toBe('TRIP_ENDED');
    });

    it('skips idempotency check when requested', async () => {
      const result = await notifyRoute({
        routeId: 'r1',
        tripId: 't4',
        routeName: 'Morning',
        busId: 'b1',
        skipIdempotencyCheck: true,
      });

      expect(result.successCount).toBe(1);
      expect(mockRunTransaction).not.toHaveBeenCalled();
    });
  });

  describe('verifyDriverRouteBinding', () => {
    it('authorizes a driver assigned to the bus', async () => {
      mockCollectionFn.mockImplementation((name: string) => {
        if (name === 'drivers') return collectionChain({ assignedBusId: 'b1' });
        return collectionChain();
      });

      expect((await verifyDriverRouteBinding('d1', 'r1', 'b1')).authorized).toBe(true);
    });

    it('authorizes a driver referenced by the bus document', async () => {
      mockCollectionFn.mockImplementation((name: string) => {
        if (name === 'drivers') return collectionChain({ assignedBusId: 'other' });
        if (name === 'buses') return collectionChain({ assignedDriverId: 'd1' });
        return collectionChain();
      });

      expect((await verifyDriverRouteBinding('d1', 'r1', 'b1')).authorized).toBe(true);
    });

    it('rejects an unassigned driver', async () => {
      mockCollectionFn.mockImplementation((name: string) => {
        if (name === 'drivers') return collectionChain({ assignedBusId: 'other' });
        if (name === 'buses') return collectionChain({ assignedDriverId: 'x', activeDriverId: 'x', driverUID: 'x' });
        return collectionChain();
      });

      expect((await verifyDriverRouteBinding('d1', 'r1', 'b1')).authorized).toBe(false);
    });

    it('rejects when the driver is missing', async () => {
      mockCollectionFn.mockImplementation((name: string) => {
        if (name === 'drivers') return collectionChain(null);
        return collectionChain();
      });

      const result = await verifyDriverRouteBinding('missing', 'r1', 'b1');
      expect(result.authorized).toBe(false);
      expect(result.reason).toContain('not found');
    });
  });
});
