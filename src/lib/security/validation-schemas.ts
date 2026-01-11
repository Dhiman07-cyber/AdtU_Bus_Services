/**
 * Input Validation Schemas for ADTU Bus Service
 * 
 * SECURITY: Server-side validation to prevent:
 * - Injection attacks
 * - Invalid data types
 * - Oversized payloads
 * - Malformed requests
 */

import { z } from 'zod';

// ============================================================================
// Common Validators
// ============================================================================

export const UIDSchema = z.string().min(1).max(128).regex(/^[a-zA-Z0-9_-]+$/, 'Invalid UID format');
export const EmailSchema = z.string().email().max(255);
export const PhoneSchema = z.string().regex(/^[+]?[0-9]{10,15}$/, 'Invalid phone number');
export const DateSchema = z.coerce.date();
export const SafeStringSchema = z.string().max(1000).transform(s => s.trim());
export const ShortStringSchema = z.string().max(200).transform(s => s.trim());

// ============================================================================
// Payment Schemas
// ============================================================================

export const CreateOrderSchema = z.object({
    amount: z.number().positive().max(1000000), // Max 10 lakh INR
    userId: z.string().optional(),
    userName: z.string().max(200).optional(),
    enrollmentId: z.string().max(100).optional(),
    purpose: z.enum(['renewal', 'new_registration', 'Bus Service Payment']).optional(),
    durationYears: z.number().int().min(1).max(5).optional(),
    notes: z.record(z.string(), z.string().max(500)).optional(),
});

export const VerifyPaymentSchema = z.object({
    razorpay_payment_id: z.string().min(1).max(100),
    razorpay_order_id: z.string().min(1).max(100),
    razorpay_signature: z.string().min(1).max(200),
    userId: z.string().optional(),
    purpose: z.string().optional(),
});

// ============================================================================
// Bus Pass Schemas
// ============================================================================

export const GenerateBusPassSchema = z.object({
    studentUid: UIDSchema,
    intendedBusId: z.string().max(50).optional(),
    deviceInfo: z.object({
        platform: z.string().max(50).optional(),
        model: z.string().max(100).optional(),
        osVersion: z.string().max(50).optional(),
    }).optional(),
    idToken: z.string().optional(), // Token can be in body or header
});

export const VerifyBusPassSchema = z.object({
    tokenId: z.string().min(1).max(200),
    scannerBusId: z.string().min(1).max(50),
});

// ============================================================================
// Student Schemas
// ============================================================================

export const StudentUpdateSchema = z.object({
    fullName: z.string().max(200).optional(),
    phone: PhoneSchema.optional(),
    alternatePhone: PhoneSchema.optional(),
    address: z.string().max(500).optional(),
    profileImageUrl: z.string().url().max(500).optional(),
    // NOT allowed: validUntil, status, sessionStartYear, sessionEndYear, etc.
});

export const RenewalRequestSchema = z.object({
    studentId: UIDSchema,
    paymentMode: z.enum(['offline']),
    transactionId: z.string().max(100),
    amount: z.number().positive().max(100000),
    durationYears: z.number().int().min(1).max(5),
    notes: z.string().max(500).optional(),
    receiptImageUrl: z.string().url().max(500).optional(),
});

// ============================================================================
// Notification Schemas
// ============================================================================

export const NotificationCreateSchema = z.object({
    title: z.string().min(1).max(200),
    content: z.string().min(1).max(5000),
    sender: z.object({
        userId: UIDSchema,
        userName: z.string().max(200),
        userRole: z.enum(['admin', 'moderator', 'driver']),
        empId: z.string().max(50).optional(),
    }),
    target: z.object({
        type: z.enum(['global', 'role_based', 'route_based', 'specific_users']),
        roleFilter: z.enum(['student', 'driver', 'moderator', 'admin', 'all']).optional(),
        routeIds: z.array(z.string().max(50)).max(50).optional(),
        userIds: z.array(UIDSchema).max(1000).optional(),
    }),
    metadata: z.object({
        type: z.string().max(50).optional(),
        priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
        expiresAt: DateSchema.optional(),
        busInfo: z.object({
            busId: z.string().max(50).optional(),
            busNumber: z.string().max(20).optional(),
            registrationPlate: z.string().max(20).optional(),
        }).optional(),
    }).optional(),
    recipientIds: z.array(UIDSchema).max(1000),
    autoInjectedRecipientIds: z.array(UIDSchema).max(100).optional(),
    deleteAfterDays: z.number().int().min(1).max(7).optional().default(1),
});

// ============================================================================
// Waiting Flag Schemas
// ============================================================================

export const WaitingFlagSchema = z.object({
    studentUid: UIDSchema,
    studentName: z.string().max(200),
    busId: z.string().max(50),
    routeId: z.string().max(50),
    stopId: z.string().max(50).optional(),
    stopName: z.string().max(200).optional(),
    stopLat: z.number().min(-90).max(90).optional(),
    stopLng: z.number().min(-180).max(180).optional(),
    message: z.string().max(500).optional(),
});

// ============================================================================
// Location Schemas
// ============================================================================

export const LocationUpdateSchema = z.object({
    busId: z.string().max(50),
    routeId: z.string().max(50),
    driverUid: UIDSchema,
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    speed: z.number().min(0).max(200).optional(), // km/h
    heading: z.number().min(0).max(360).optional(),
    accuracy: z.number().min(0).max(1000).optional(), // meters
    tripId: z.string().max(100).optional(),
});

// ============================================================================
// Driver Schemas
// ============================================================================

export const DriverSwapRequestSchema = z.object({
    fromDriverUID: UIDSchema,
    toDriverUID: UIDSchema,
    busId: z.string().max(50),
    routeId: z.string().max(50),
    startsAt: DateSchema,
    endsAt: DateSchema,
    reason: z.string().max(500).optional(),
});

// ============================================================================
// Admin/Moderator Schemas
// ============================================================================

export const ApproveRenewalSchema = z.object({
    requestId: z.string().max(100),
    approverId: UIDSchema,
    approverName: z.string().max(200),
    approverRole: z.enum(['admin', 'moderator']),
    approverEmpId: z.string().max(50).optional(),
});

export const RejectRenewalSchema = z.object({
    requestId: z.string().max(100),
    rejectorId: UIDSchema,
    rejectorName: z.string().max(200),
    reason: z.string().max(500),
});

// ============================================================================
// Validation Helper Function
// ============================================================================

export type ValidationResult<T> =
    | { success: true; data: T }
    | { success: false; error: string; details?: z.ZodError };

/**
 * Validate input against a Zod schema
 * Returns typed data on success, or error message on failure
 */
export function validateInput<T>(
    schema: z.ZodSchema<T>,
    input: unknown
): ValidationResult<T> {
    try {
        const data = schema.parse(input);
        return { success: true, data };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const issues = error.issues.map(i => `${i.path.join('.')}: ${i.message}`);
            return {
                success: false,
                error: `Validation failed: ${issues.join(', ')}`,
                details: error
            };
        }
        return { success: false, error: 'Invalid input' };
    }
}

/**
 * Sanitize string to prevent XSS
 * Removes potentially dangerous HTML/script content
 */
export function sanitizeHtml(input: string): string {
    return input
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#x27;')
        .replace(/\//g, '&#x2F;')
        .replace(/`/g, '&#x60;')
        .replace(/=/g, '&#x3D;');
}

/**
 * Safe string validation with XSS sanitization
 */
export const SanitizedStringSchema = z.string().max(5000).transform(sanitizeHtml);
