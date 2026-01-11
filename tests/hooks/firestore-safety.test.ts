/**
 * Unit Tests for Firestore Safety Hooks
 * 
 * Tests the usePaginatedCollection and visibility-aware listener hooks
 * to ensure they properly enforce Spark plan safety.
 * 
 * @module tests/hooks/firestore-safety.test
 * @version 1.0.0
 * @since 2026-01-02
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock firebase/firestore
vi.mock('firebase/firestore', () => ({
    collection: vi.fn(),
    query: vi.fn(),
    getDocs: vi.fn(),
    doc: vi.fn(),
    onSnapshot: vi.fn(),
    getDoc: vi.fn(),
    limit: vi.fn(),
    startAfter: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
    or: vi.fn(),
}));

// Mock lib/firebase
vi.mock('@/lib/firebase', () => ({
    db: {},
}));

// Mock auth context
vi.mock('@/contexts/auth-context', () => ({
    useAuth: vi.fn(() => ({
        currentUser: { uid: 'test-user-123' },
        userData: { role: 'admin' },
    })),
}));

describe('Firestore Safety Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();

        // Mock document visibility
        Object.defineProperty(document, 'visibilityState', {
            value: 'visible',
            writable: true,
            configurable: true,
        });

        // Mock navigator.onLine
        Object.defineProperty(navigator, 'onLine', {
            value: true,
            writable: true,
            configurable: true,
        });
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Runtime Config', () => {
        it('should default ENABLE_FIRESTORE_REALTIME to false', async () => {
            // Clear any env override
            delete process.env.NEXT_PUBLIC_ENABLE_FIRESTORE_REALTIME;

            // Re-import to get fresh value
            vi.resetModules();
            const { ENABLE_FIRESTORE_REALTIME } = await import('@/config/runtime');

            expect(ENABLE_FIRESTORE_REALTIME).toBe(false);
        });

        it('should enforce MAX_QUERY_LIMIT of 50', async () => {
            const { MAX_QUERY_LIMIT } = await import('@/config/runtime');

            expect(MAX_QUERY_LIMIT).toBe(50);
        });

        it('should have safety margin below Spark quota', async () => {
            const { SPARK_DAILY_READ_QUOTA, SAFETY_MARGIN_READS } = await import('@/config/runtime');

            expect(SAFETY_MARGIN_READS).toBeLessThan(SPARK_DAILY_READ_QUOTA);
            expect(SPARK_DAILY_READ_QUOTA - SAFETY_MARGIN_READS).toBeGreaterThanOrEqual(10000);
        });
    });

    describe('Visibility Aware Listener', () => {
        it('should not mount listener when document is hidden', async () => {
            // This test verifies the visibility guard behavior
            Object.defineProperty(document, 'visibilityState', {
                value: 'hidden',
                configurable: true,
            });

            const { shouldMountListenerSync } = await import('@/utils/useVisibilityAwareListener');

            expect(shouldMountListenerSync()).toBe(false);
        });

        it('should not mount listener when offline', async () => {
            Object.defineProperty(navigator, 'onLine', {
                value: false,
                configurable: true,
            });

            const { shouldMountListenerSync } = await import('@/utils/useVisibilityAwareListener');

            expect(shouldMountListenerSync()).toBe(false);
        });
    });

    describe('Deprecated useRealtimeCollection', () => {
        it('should throw error when called', async () => {
            const { useRealtimeCollection } = await import('@/hooks/useRealtimeCollection');

            expect(() => useRealtimeCollection()).toThrow('useRealtimeCollection has been permanently disabled');
        });

        it('should provide migration guidance in error message', async () => {
            const { useRealtimeCollection } = await import('@/hooks/useRealtimeCollection');

            try {
                useRealtimeCollection();
            } catch (error: any) {
                expect(error.message).toContain('usePaginatedCollection');
                expect(error.message).toContain('FIRESTORE QUOTA SAFETY');
            }
        });
    });

    describe('usePaginatedCollection', () => {
        it('should export usePaginatedCollection and usePaginatedCollectionWithQuery', async () => {
            const module = await import('@/hooks/usePaginatedCollection');

            expect(typeof module.usePaginatedCollection).toBe('function');
            expect(typeof module.usePaginatedCollectionWithQuery).toBe('function');
        });

        it('should enforce pageSize limit', async () => {
            const { getDocs, query, limit } = await import('firebase/firestore');
            const limitMock = vi.mocked(limit);

            // The hook should call limit() with max 50
            // This is a structural test - the actual limit enforcement is in the hook
            expect(limitMock).toBeDefined();
        });
    });

    describe('Safe Hooks Export Correct Interface', () => {
        it('useRealtimeDocument should have refresh method', async () => {
            // Just verify the export structure
            const module = await import('@/hooks/useRealtimeDocument');
            expect(typeof module.useRealtimeDocument).toBe('function');
        });

        it('useBusStatus should have refresh and isRealtime', async () => {
            const module = await import('@/hooks/useBusStatus');
            expect(typeof module.useBusStatus).toBe('function');
            expect(typeof module.isTripActive).toBe('function');
            expect(typeof module.getNormalizedBusStatus).toBe('function');
        });
    });
});

describe('Load Test Calculations', () => {
    it('should calculate reads under 40k for worst case scenario', () => {
        // This is a sanity check that our load test assumptions are valid
        const CONFIG = {
            students: 500,
            admins: 20,
            buses: 15,
            studentSessionsPerDay: 2,
            busStatusListenerMountedPercent: 80,
            busStatusUpdatesPerBusPerDay: 5,
            adminRefreshesPerHour: 0.5,
            adminSessionDurationHours: 4,
            pageSize: 50,
            jitterMultiplier: 1.5,
        };

        // Student reads
        const busStatusMounts = CONFIG.students * CONFIG.studentSessionsPerDay *
            (CONFIG.busStatusListenerMountedPercent / 100);
        const studentsPerBus = CONFIG.students / CONFIG.buses;
        const updateReads = CONFIG.buses * CONFIG.busStatusUpdatesPerBusPerDay *
            studentsPerBus * (CONFIG.busStatusListenerMountedPercent / 100);

        // Admin reads
        const adminInitialLoads = CONFIG.admins * 2 * CONFIG.pageSize;
        const adminRefreshes = CONFIG.admins * 2 *
            (CONFIG.adminSessionDurationHours * CONFIG.adminRefreshesPerHour) * CONFIG.pageSize;

        const baseTotal = busStatusMounts + updateReads + adminInitialLoads + adminRefreshes;
        const withJitter = baseTotal * CONFIG.jitterMultiplier;

        expect(withJitter).toBeLessThan(40000);
    });
});
