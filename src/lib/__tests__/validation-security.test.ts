/**
 * Tests for validation schemas, security utilities, and pure business logic.
 * ────────────────────────────────────────────────────────────────────────
 * Run: npm test -- src/lib/__tests__/validation-security.test.ts
 */

import { describe, it, expect } from 'vitest';
import {
  validateInput,
  SubmitApplicationSchema,
  SaveDraftSchema,
  AddModeratorSchema,
  UpdateModeratorSchema,
  UpdatePermissionsSchema,
  CreateOrderSchema,
  VerifyPaymentSchema,
  StudentUpdateSchema,
  StartTripSchema,
  EndTripSchema,
  HeartbeatSchema,
  DriverSwapRequestSchema,
  LocationUpdateSchema,
  ApprovePaymentSchema,
  RejectPaymentSchema,
  ApproveRenewalSchema,
  RejectRenewalSchema,
  SaveFCMTokenSchema,
  CreateUserSchema,
  RenewApplicationSchema,
} from '../security/validation-schemas';
import { buildCapacityDelta } from '../busCapacityService';

// ════════════════════════════════════════════════════════════════════════
// SubmitApplicationSchema
// ════════════════════════════════════════════════════════════════════════

describe('SubmitApplicationSchema', () => {
  it('accepts valid submission payload', () => {
    const result = validateInput(SubmitApplicationSchema, {
      formData: {
        fullName: 'John Doe',
        email: 'john@example.com',
        enrollmentId: 'ENR001',
        sessionInfo: { sessionStartYear: 2026, sessionEndYear: 2027, durationYears: 1 },
        paymentInfo: { paymentMode: 'online', amountPaid: 5000 },
      },
      needsCapacityReview: false,
    });
    expect(result.success).toBe(true);
  });

  it('accepts minimal formData with just paymentInfo', () => {
    const result = validateInput(SubmitApplicationSchema, {
      formData: { paymentInfo: { paymentMode: 'offline' } },
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing formData', () => {
    const result = validateInput(SubmitApplicationSchema, {});
    expect(result.success).toBe(false);
  });

  it('rejects non-object formData', () => {
    const result = validateInput(SubmitApplicationSchema, { formData: 'not-an-object' });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// SaveDraftSchema
// ════════════════════════════════════════════════════════════════════════

describe('SaveDraftSchema', () => {
  it('accepts draft with formData only', () => {
    const result = validateInput(SaveDraftSchema, { formData: { fullName: 'John' } });
    expect(result.success).toBe(true);
  });

  it('accepts draft with applicationId', () => {
    const result = validateInput(SaveDraftSchema, { applicationId: 'abc123', formData: {} });
    expect(result.success).toBe(true);
  });

  it('rejects missing formData', () => {
    const result = validateInput(SaveDraftSchema, {});
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// AddModeratorSchema
// ════════════════════════════════════════════════════════════════════════

describe('AddModeratorSchema', () => {
  it('accepts valid moderator data', () => {
    const result = validateInput(AddModeratorSchema, {
      email: 'mod@example.com',
      name: 'Moderator One',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with optional fields', () => {
    const result = validateInput(AddModeratorSchema, {
      email: 'mod@example.com',
      name: 'Mod One',
      phone: '1234567890',
      faculty: 'Engineering',
      employeeId: 'EMP001',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = validateInput(AddModeratorSchema, { name: 'Mod' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = validateInput(AddModeratorSchema, { email: 'not-an-email', name: 'Mod' });
    expect(result.success).toBe(false);
  });

  it('rejects missing name', () => {
    const result = validateInput(AddModeratorSchema, { email: 'mod@example.com' });
    expect(result.success).toBe(false);
  });

  it('defaults role to moderator', () => {
    const result = validateInput(AddModeratorSchema, { email: 'mod@example.com', name: 'Mod' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.role).toBe('moderator');
    }
  });
});

// ════════════════════════════════════════════════════════════════════════
// UpdateModeratorSchema
// ════════════════════════════════════════════════════════════════════════

describe('UpdateModeratorSchema', () => {
  it('accepts partial update', () => {
    const result = validateInput(UpdateModeratorSchema, { fullName: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('accepts empty update', () => {
    const result = validateInput(UpdateModeratorSchema, {});
    expect(result.success).toBe(true);
  });

  it('rejects invalid profilePhotoUrl', () => {
    const result = validateInput(UpdateModeratorSchema, { profilePhotoUrl: 'not-a-url' });
    expect(result.success).toBe(false);
  });

  it('accepts null profilePhotoUrl', () => {
    const result = validateInput(UpdateModeratorSchema, { profilePhotoUrl: null });
    expect(result.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// UpdatePermissionsSchema
// ════════════════════════════════════════════════════════════════════════

describe('UpdatePermissionsSchema', () => {
  const fullPermissions = {
    students: { canView: true, canAdd: true, canEdit: true, canDelete: true, canReassign: true },
    drivers: { canView: true, canAdd: true, canEdit: true, canDelete: true, canReassign: true },
    buses: { canView: true, canAdd: true, canEdit: true, canDelete: true, canReassign: true },
    routes: { canView: true, canAdd: true, canEdit: true, canDelete: true },
    applications: { canView: true, canApprove: true, canReject: true, canGenerateVerificationCode: true, canAppearInModeratorList: true },
    payments: { canApproveOfflinePayment: true, canRejectOfflinePayment: true },
  };

  it('accepts valid full permissions', () => {
    const result = validateInput(UpdatePermissionsSchema, { permissions: fullPermissions });
    expect(result.success).toBe(true);
  });

  it('accepts disabled permissions', () => {
    const disabled = Object.fromEntries(
      Object.entries(fullPermissions).map(([k, v]) => [
        k,
        Object.fromEntries(Object.entries(v as Record<string, boolean>).map(([pk]) => [pk, false])),
      ])
    );
    const result = validateInput(UpdatePermissionsSchema, { permissions: disabled });
    expect(result.success).toBe(true);
  });

  it('rejects missing category', () => {
    const { students, ...partial } = fullPermissions;
    const result = validateInput(UpdatePermissionsSchema, { permissions: partial });
    expect(result.success).toBe(false);
  });

  it('rejects missing permissions field', () => {
    const result = validateInput(UpdatePermissionsSchema, {});
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// CreateOrderSchema
// ════════════════════════════════════════════════════════════════════════

describe('CreateOrderSchema', () => {
  it('accepts valid order', () => {
    const result = validateInput(CreateOrderSchema, { amount: 5000 });
    expect(result.success).toBe(true);
  });

  it('rejects zero amount', () => {
    const result = validateInput(CreateOrderSchema, { amount: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects negative amount', () => {
    const result = validateInput(CreateOrderSchema, { amount: -100 });
    expect(result.success).toBe(false);
  });

  it('rejects amount over 10 lakh', () => {
    const result = validateInput(CreateOrderSchema, { amount: 1_000_001 });
    expect(result.success).toBe(false);
  });

  it('accepts amount at upper boundary', () => {
    const result = validateInput(CreateOrderSchema, { amount: 1_000_000 });
    expect(result.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// VerifyPaymentSchema
// ════════════════════════════════════════════════════════════════════════

describe('VerifyPaymentSchema', () => {
  it('accepts valid payment verification', () => {
    const result = validateInput(VerifyPaymentSchema, {
      razorpay_payment_id: 'pay_abc123',
      razorpay_order_id: 'order_def456',
      razorpay_signature: 'sig_xyz789',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing payment_id', () => {
    const result = validateInput(VerifyPaymentSchema, {
      razorpay_order_id: 'order_def456',
      razorpay_signature: 'sig_xyz789',
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// StudentUpdateSchema
// ════════════════════════════════════════════════════════════════════════

describe('StudentUpdateSchema', () => {
  it('accepts valid student update', () => {
    const result = validateInput(StudentUpdateSchema, {
      fullName: 'John Doe',
      phone: '+919876543210',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid phone number', () => {
    const result = validateInput(StudentUpdateSchema, { phone: 'not-a-number' });
    expect(result.success).toBe(false);
  });

  it('rejects too-long name', () => {
    const result = validateInput(StudentUpdateSchema, { fullName: 'A'.repeat(201) });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Trip Schemas
// ════════════════════════════════════════════════════════════════════════

describe('StartTripSchema', () => {
  it('accepts valid start trip', () => {
    const result = validateInput(StartTripSchema, { busId: 'bus_001', routeId: 'route_001' });
    expect(result.success).toBe(true);
  });

  it('accepts with shift', () => {
    const result = validateInput(StartTripSchema, { busId: 'bus_001', routeId: 'route_001', shift: 'morning' });
    expect(result.success).toBe(true);
  });

  it('rejects missing busId', () => {
    const result = validateInput(StartTripSchema, { routeId: 'route_001' });
    expect(result.success).toBe(false);
  });
});

describe('EndTripSchema', () => {
  it('accepts valid end trip', () => {
    const result = validateInput(EndTripSchema, { busId: 'bus_001' });
    expect(result.success).toBe(true);
  });
});

describe('HeartbeatSchema', () => {
  it('accepts valid heartbeat', () => {
    const result = validateInput(HeartbeatSchema, { tripId: 'trip_001', busId: 'bus_001' });
    expect(result.success).toBe(true);
  });

  it('rejects missing busId', () => {
    const result = validateInput(HeartbeatSchema, { tripId: 'trip_001' });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// DriverSwapRequestSchema
// ════════════════════════════════════════════════════════════════════════

describe('DriverSwapRequestSchema', () => {
  const valid = {
    fromDriverUID: 'driver_001',
    toDriverUID: 'driver_002',
    busId: 'bus_001',
    routeId: 'route_001',
    startsAt: '2026-07-01T08:00:00Z',
    endsAt: '2026-07-01T16:00:00Z',
  };

  it('accepts valid swap request', () => {
    const result = validateInput(DriverSwapRequestSchema, valid);
    expect(result.success).toBe(true);
  });

  it('accepts with reason', () => {
    const result = validateInput(DriverSwapRequestSchema, {
      ...valid,
      reason: 'Shift change needed',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing fields', () => {
    const result = validateInput(DriverSwapRequestSchema, { fromDriverUID: 'driver_001' });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// LocationUpdateSchema
// ════════════════════════════════════════════════════════════════════════

describe('LocationUpdateSchema', () => {
  const valid = {
    busId: 'bus_001',
    routeId: 'route_001',
    driverUid: 'driver_001',
    lat: 25.5941,
    lng: 85.1376,
  };

  it('accepts valid location update', () => {
    const result = validateInput(LocationUpdateSchema, valid);
    expect(result.success).toBe(true);
  });

  it('rejects out-of-range lat', () => {
    const result = validateInput(LocationUpdateSchema, { ...valid, lat: 100 });
    expect(result.success).toBe(false);
  });

  it('rejects out-of-range lng', () => {
    const result = validateInput(LocationUpdateSchema, { ...valid, lng: 200 });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Payment Approve/Reject
// ════════════════════════════════════════════════════════════════════════

describe('ApprovePaymentSchema', () => {
  it('accepts valid paymentId', () => {
    const result = validateInput(ApprovePaymentSchema, { paymentId: 'pay_abc' });
    expect(result.success).toBe(true);
  });

  it('rejects missing paymentId', () => {
    const result = validateInput(ApprovePaymentSchema, {});
    expect(result.success).toBe(false);
  });
});

describe('RejectPaymentSchema', () => {
  it('accepts valid paymentId', () => {
    const result = validateInput(RejectPaymentSchema, { paymentId: 'pay_abc' });
    expect(result.success).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════
// ApproveRenewalSchema / RejectRenewalSchema
// ════════════════════════════════════════════════════════════════════════

describe('ApproveRenewalSchema', () => {
  const valid = {
    requestId: 'req_001',
    approverId: 'uid_001',
    approverName: 'Admin',
    approverRole: 'admin' as const,
  };

  it('accepts valid renewal approval', () => {
    const result = validateInput(ApproveRenewalSchema, valid);
    expect(result.success).toBe(true);
  });

  it('rejects invalid approverRole', () => {
    const result = validateInput(ApproveRenewalSchema, { ...valid, approverRole: 'student' });
    expect(result.success).toBe(false);
  });
});

describe('RejectRenewalSchema', () => {
  it('accepts valid rejection', () => {
    const result = validateInput(RejectRenewalSchema, {
      requestId: 'req_001',
      rejectorId: 'uid_001',
      rejectorName: 'Admin',
      reason: 'Incomplete documents',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing reason', () => {
    const result = validateInput(RejectRenewalSchema, {
      requestId: 'req_001',
      rejectorId: 'uid_001',
      rejectorName: 'Admin',
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// FCM Token Schema
// ════════════════════════════════════════════════════════════════════════

describe('SaveFCMTokenSchema', () => {
  const validToken = 'f'.repeat(150);
  it('accepts valid FCM token', () => {
    const result = validateInput(SaveFCMTokenSchema, {
      userUid: 'uid_001',
      token: validToken,
    });
    expect(result.success).toBe(true);
  });

  it('rejects token with whitespace', () => {
    const result = validateInput(SaveFCMTokenSchema, {
      userUid: 'uid_001',
      token: 'token with spaces',
    });
    expect(result.success).toBe(false);
  });

  it('rejects too-short token', () => {
    const result = validateInput(SaveFCMTokenSchema, {
      userUid: 'uid_001',
      token: 'short',
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// CreateUserSchema (moderator/admin create-user endpoint)
// ════════════════════════════════════════════════════════════════════════

describe('CreateUserSchema', () => {
  it('accepts valid student creation', () => {
    const result = validateInput(CreateUserSchema, {
      email: 'student@example.com',
      name: 'Student Name',
      role: 'student',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid role', () => {
    const result = validateInput(CreateUserSchema, {
      email: 'test@example.com',
      name: 'Test',
      role: 'superadmin',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = validateInput(CreateUserSchema, {
      email: 'not-email',
      name: 'Test',
      role: 'student',
    });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// RenewApplicationSchema
// ════════════════════════════════════════════════════════════════════════

describe('RenewApplicationSchema', () => {
  it('accepts valid renewal', () => {
    const result = validateInput(RenewApplicationSchema, {
      studentId: 'uid_001',
      duration: 1,
    });
    expect(result.success).toBe(true);
  });

  it('rejects duration over 10', () => {
    const result = validateInput(RenewApplicationSchema, {
      studentId: 'uid_001',
      duration: 11,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing studentId', () => {
    const result = validateInput(RenewApplicationSchema, { duration: 1 });
    expect(result.success).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════
// buildCapacityDelta (pure bus capacity mutation math)
// ════════════════════════════════════════════════════════════════════════

describe('buildCapacityDelta', () => {
  const baseBus = { capacity: 55, currentMembers: 30, load: { morningCount: 20, eveningCount: 10 } };

  it('increments total for morning-shift student', () => {
    const d = buildCapacityDelta(baseBus, 'Morning', 1);
    expect(d.oldMembers).toBe(30);
    expect(d.newMembers).toBe(31);
    expect(d.capacity).toBe(55);
    expect(d.updates.currentMembers).toBe(31);
    expect(d.updates['load.morningCount']).toBe(21);
  });

  it('decrements total for evening-shift student', () => {
    const d = buildCapacityDelta(baseBus, 'Evening', -1);
    expect(d.newMembers).toBe(29);
    expect(d.updates['load.eveningCount']).toBe(9);
  });

  it('increments both for "both" shift', () => {
    const d = buildCapacityDelta(baseBus, 'both', 1);
    expect(d.newMembers).toBe(31);
    expect(d.updates['load.morningCount']).toBe(21);
    expect(d.updates['load.eveningCount']).toBe(11);
  });

  it('handles empty bus data gracefully', () => {
    const d = buildCapacityDelta(undefined, undefined, 1);
    expect(d.oldMembers).toBe(0);
    expect(d.newMembers).toBe(1);
    expect(d.capacity).toBe(55);
  });

  it('never decrements below zero', () => {
    const d = buildCapacityDelta({ currentMembers: 0, capacity: 55 }, 'Morning', -1);
    expect(d.newMembers).toBe(0);
    expect(d.updates['load.morningCount']).toBe(0);
  });

  it('handles missing load object', () => {
    const d = buildCapacityDelta({ currentMembers: 5, capacity: 55 }, 'Morning', 1);
    expect(d.updates['load.morningCount']).toBe(1);
  });

  it('handles shift variations', () => {
    const d1 = buildCapacityDelta(baseBus, 'morning shift', 1);
    expect(d1.updates['load.morningCount']).toBe(21);

    const d2 = buildCapacityDelta(baseBus, 'Evening Shift', 1);
    expect(d2.updates['load.eveningCount']).toBe(11);
  });
});
