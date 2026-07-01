/**
 * Document Cryptography Service for ADTU Bus Services
 * 
 * Provides bank-grade cryptographic document signing and verification:
 * - RSA-2048 asymmetric key pairs for digital signatures
 * - SHA-256 hashing of all document fields
 * - Tamper-proof QR codes with minimal data
 * - Public key verification for client-side validation
 * 
 * SECURITY MODEL:
 * 1. Receipt Generation: Hash all fields → Sign with PRIVATE key → Store signature
 * 2. QR Code: Contains only Receipt ID + Signature + Verification URL
 * 3. Verification: Fetch from DB → Recompute hash → Verify with PUBLIC key
 * 4. ANY modification to stored data will cause signature mismatch
 */

import * as crypto from 'crypto';

// ============================================================================
// KEY MANAGEMENT
// ============================================================================

/**
 * In production, these keys should be:
 * - Private key: Stored in secure vault (e.g., AWS KMS, Azure Key Vault, Google Cloud KMS)
 * - Public key: Can be distributed to verification endpoints
 * 
 * Production requires a stable RSA key pair from environment variables.
 */

// Environment-based key loading with fallback generation
const normalizePem = (value?: string): string => {
  let val = (value || '').trim();
  if (val.startsWith('"') && val.endsWith('"')) {
    val = val.slice(1, -1);
  }
  return val.replace(/\\n/g, '\n').trim();
};
const PRIVATE_KEY_PEM = normalizePem(process.env.DOCUMENT_PRIVATE_KEY);
const PUBLIC_KEY_PEM = normalizePem(process.env.DOCUMENT_PUBLIC_KEY);

// Cached key pair
let cachedKeyPair: { privateKey: string; publicKey: string } | null = null;

function assertMatchingKeyPair(privateKeyPem: string, publicKeyPem: string): void {
    const probe = 'adtu-itms-document-key-probe';
    const signature = crypto.sign('RSA-SHA256', Buffer.from(probe), privateKeyPem);
    const matches = crypto.verify('RSA-SHA256', Buffer.from(probe), publicKeyPem, signature);

    if (!matches) {
        throw new Error('Document signing private/public keys do not match');
    }
}

/**
 * Retrieve the RSA key pair for document signing.
 * In production this fails closed unless both keys are configured.
 */
function getKeyPair(): { privateKey: string; publicKey: string } {
    if (cachedKeyPair) return cachedKeyPair;

    // If keys are provided via environment variables, validate and use them.
    if (PRIVATE_KEY_PEM && PUBLIC_KEY_PEM) {
        const privateKey = crypto.createPrivateKey(PRIVATE_KEY_PEM);
        const publicKey = crypto.createPublicKey(PUBLIC_KEY_PEM);
        const privateDetails = privateKey.asymmetricKeyDetails;
        const publicDetails = publicKey.asymmetricKeyDetails;

        if (
            privateKey.asymmetricKeyType !== 'rsa' ||
            publicKey.asymmetricKeyType !== 'rsa' ||
            (privateDetails?.modulusLength && privateDetails.modulusLength < 2048) ||
            (publicDetails?.modulusLength && publicDetails.modulusLength < 2048)
        ) {
            throw new Error('Document signing keys must be RSA-2048 or stronger');
        }

        assertMatchingKeyPair(PRIVATE_KEY_PEM, PUBLIC_KEY_PEM);

        cachedKeyPair = { privateKey: PRIVATE_KEY_PEM, publicKey: PUBLIC_KEY_PEM };
        return cachedKeyPair;
    }

    if (process.env.NODE_ENV === 'production') {
        throw new Error('DOCUMENT_PRIVATE_KEY and DOCUMENT_PUBLIC_KEY are required in production');
    }

    // Development-only fallback. These signatures are not durable across restarts.
    try {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        cachedKeyPair = { privateKey, publicKey };
        if (process.env.NODE_ENV !== 'test' && !process.env.VITEST) {
            console.warn('Document signing keys are generated in-memory for development. Configure DOCUMENT_PRIVATE_KEY and DOCUMENT_PUBLIC_KEY before production.');
        }
        return cachedKeyPair;
    } catch (error) {
        console.error('Failed to generate key pair:', error);
        throw new Error('Document signing keys unavailable');
    }
}

// ============================================================================
// TYPES
// ============================================================================

/**
 * Canonical receipt payload - ALL fields that contribute to the signature
 * These fields are sorted and serialized deterministically
 */
export interface DocumentPayload {
    receiptId: string;
    studentUid: string;
    studentName: string;
    enrollmentId: string;
    amount: number;
    method: 'Online' | 'Offline';
    sessionStartYear: string;
    sessionEndYear: string;
    validUntil: string;
    transactionDate: string;
    razorpayOrderId?: string;
    razorpayPaymentId?: string;
    offlineTransactionId?: string;
    approvedBy?: string;
}

type ApprovedByValue =
    | string
    | {
        name?: string;
        uid?: string;
        userId?: string;
        empId?: string;
        role?: string;
    }
    | null
    | undefined;

export interface PaymentDocumentSource {
    payment_id: string;
    student_uid?: string | null;
    student_name?: string | null;
    student_id?: string | null;
    amount?: number | null;
    method?: string | null;
    session_start_year?: string | number | null;
    session_end_year?: string | number | null;
    valid_until?: string | null;
    transaction_date?: string | null;
    created_at?: string | null;
    razorpay_order_id?: string | null;
    razorpay_payment_id?: string | null;
    offline_transaction_id?: string | null;
    approved_by?: ApprovedByValue;
}

/**
 * Compact QR code payload - minimal data for scanning
 */
export interface SecureQRPayload {
    rid: string;  // Receipt ID
    sig: string;  // Digital signature (truncated for QR size)
    ver: number;  // Version for future schema upgrades
}

export interface SignatureVerificationResult {
    valid: boolean;
    status: 'valid' | 'invalid' | 'tampered' | 'expired' | 'not_found' | 'signature_mismatch';
    message: string;
    suspicious?: boolean;
    computedHash?: string;
}

// ============================================================================
// DOCUMENT HASH GENERATION
// ============================================================================

/**
 * Create a canonical string representation of the document payload
 * Keys are sorted alphabetically to ensure consistent hashing
 */
function canonicalizePayload(payload: DocumentPayload): string {
    const sortedPayload: Partial<Record<keyof DocumentPayload, string | number>> = {};
    const keys = (Object.keys(payload) as Array<keyof DocumentPayload>).sort();

    for (const key of keys) {
        const value = payload[key];
        if (value !== undefined && value !== null && value !== '') {
            sortedPayload[key] = value;
        }
    }

    // Use compact JSON without whitespace for consistent hashing
    return JSON.stringify(sortedPayload);
}

/**
 * Generate SHA-256 hash of the document payload
 */
export function hashDocumentPayload(payload: DocumentPayload): string {
    const canonical = canonicalizePayload(payload);
    return crypto.createHash('sha256').update(canonical, 'utf8').digest('hex');
}

// ============================================================================
// DIGITAL SIGNATURE OPERATIONS
// ============================================================================

/**
 * Sign a document payload using RSA-2048 private key
 * Returns the signature in base64 format
 */
export function signDocumentPayload(payload: DocumentPayload): string {
    try {
        const { privateKey } = getKeyPair();
        const payloadHash = hashDocumentPayload(payload);

        // Sign the hash with RSA-SHA256
        const sign = crypto.createSign('RSA-SHA256');
        sign.update(payloadHash, 'utf8');
        sign.end();

        const signature = sign.sign(privateKey, 'base64');
        return signature;
    } catch (error) {
        console.error('Document signing failed:', error);
        throw new Error('Failed to sign document');
    }
}

/**
 * Verify a document signature using RSA-2048 public key
 * @param payload - The document payload to verify
 * @param signature - The base64 signature to verify against
 */
export function verifyDocumentSignature(payload: DocumentPayload, signature: string): boolean {
    try {
        const { publicKey } = getKeyPair();
        const payloadHash = hashDocumentPayload(payload);

        // Verify the signature
        const verify = crypto.createVerify('RSA-SHA256');
        verify.update(payloadHash, 'utf8');
        verify.end();

        return verify.verify(publicKey, signature, 'base64');
    } catch (error) {
        console.error('Signature verification failed:', error);
        return false;
    }
}

// ============================================================================
// SECURE QR CODE GENERATION
// ============================================================================

/**
 * Generate secure QR code data for a receipt
 * Contains: Receipt ID + Truncated Signature + Version
 * 
 * The QR code is intentionally minimal:
 * - Receipt ID: Links to full data in database
 * - Signature: Proves document wasn't tampered (truncated for QR size)
 * - Version: Allows future schema upgrades
 */
export function generateSecureQRData(payload: DocumentPayload, existingSignature?: string): string {
    const fullSignature = existingSignature || signDocumentPayload(payload);

    // Truncate signature for QR code (first 64 chars is still cryptographically strong)
    const truncatedSignature = fullSignature.substring(0, 64);

    const qrPayload: SecureQRPayload = {
        rid: payload.receiptId,
        sig: truncatedSignature,
        ver: 2  // Version 2: RSA-2048 signatures
    };

    // Encode as base64url for compact representation
    const encoded = Buffer.from(JSON.stringify(qrPayload)).toString('base64url');

    // Add prefix for identification
    return `ADTU-R2-${encoded}`;
}

/**
 * Parse secure QR code data
 * Returns the receipt ID and truncated signature for database lookup
 */
export function parseSecureQRData(qrData: string): SecureQRPayload | null {
    try {
        // Check prefix
        if (!qrData.startsWith('ADTU-R2-')) {
            // Check for legacy format (ADTU-R1-) for backward compatibility
            if (qrData.startsWith('ADTU-R1-')) {
                return parseLegacyQRData(qrData);
            }
            return null;
        }

        const base64Part = qrData.substring(8);
        if (!/^[A-Za-z0-9_-]+$/.test(base64Part)) {
            return null;
        }

        const decoded = Buffer.from(base64Part, 'base64url').toString('utf8');
        const parsed = JSON.parse(decoded);

        if (
            parsed.ver !== 2 ||
            typeof parsed.rid !== 'string' ||
            typeof parsed.sig !== 'string' ||
            !parsed.rid ||
            !/^[A-Za-z0-9+/=]{64}$/.test(parsed.sig)
        ) {
            return null;
        }

        return parsed as SecureQRPayload;
    } catch {
        return null;
    }
}

/**
 * Parse legacy ADTU-R1- format for backward compatibility
 */
function parseLegacyQRData(qrData: string): SecureQRPayload | null {
    try {
        const base64Part = qrData.substring(8);
        const decoded = Buffer.from(base64Part, 'base64url').toString('utf8');
        const parsed = JSON.parse(decoded);

        // Legacy format uses 'r' for receipt ID
        if (parsed.r) {
            return {
                rid: parsed.r,
                sig: parsed.s || '',
                ver: 1
            };
        }

        return null;
    } catch {
        return null;
    }
}

// ============================================================================
// FULL VERIFICATION FLOW
// ============================================================================

/**
 * Verify a receipt signature against database-stored values
 * This is the main verification function called by the API
 * 
 * @param storedPayload - The document payload reconstructed from database
 * @param storedSignature - The signature stored with the receipt
 * @param truncatedSignature - The signature from QR code (optional, for QR verification)
 */
export function verifyReceiptIntegrity(
    storedPayload: DocumentPayload,
    storedSignature: string,
    truncatedSignature?: string
): SignatureVerificationResult {
    try {
        // Step 1: If truncated signature provided (from QR), verify it matches stored
        if (truncatedSignature) {
            const storedPrefix = storedSignature.substring(0, 64);
            if (storedPrefix !== truncatedSignature) {
                return {
                    valid: false,
                    status: 'tampered',
                    message: 'Unable to verify document authenticity. This receipt appears to be modified or not generated by the ADTU Bus Services system. Please present the original, system-generated document.',
                    suspicious: true
                };
            }
        }

        // Step 2: Verify the full signature against the payload
        const isValid = verifyDocumentSignature(storedPayload, storedSignature);

        if (!isValid) {
            return {
                valid: false,
                status: 'signature_mismatch',
                message: 'Unable to verify document authenticity. This receipt appears to be modified or not generated by the ADTU Bus Services system. Please present the original, system-generated document. Note: Editing this file invalidates its security signature.',
                suspicious: true
            };
        }

        return {
            valid: true,
            status: 'valid',
            message: 'Document authenticity verified. This receipt is genuine.',
            computedHash: hashDocumentPayload(storedPayload)
        };
    } catch (error) {
        console.error('Receipt integrity verification failed:', error);
        return {
            valid: false,
            status: 'invalid',
            message: 'Verification failed due to a system error.',
            suspicious: false
        };
    }
}

// ============================================================================
// DOCUMENT PAYLOAD BUILDER
// ============================================================================

/**
 * Build a canonical document payload from payment record
 * This ensures consistent payload construction across generation and verification
 */
export function buildDocumentPayload(payment: {
    payment_id: string;
    student_uid: string;
    student_name: string;
    student_id: string;
    amount: number;
    method: string;
    session_start_year?: string;
    session_end_year?: string;
    valid_until?: string;
    transaction_date?: string;
    created_at?: string;
    razorpay_order_id?: string;
    razorpay_payment_id?: string;
    offline_transaction_id?: string;
    approved_by?: ApprovedByValue;
}): DocumentPayload {
    // Normalize approved_by to string
    let approvedByStr = '';
    if (payment.approved_by) {
        if (typeof payment.approved_by === 'object') {
            approvedByStr = payment.approved_by.name || payment.approved_by.uid || '';
        } else {
            approvedByStr = String(payment.approved_by);
        }
    }

    return {
        receiptId: payment.payment_id,
        studentUid: payment.student_uid,
        studentName: payment.student_name,
        enrollmentId: payment.student_id,
        amount: payment.amount,
        method: (payment.method === 'Online' || payment.method === 'Offline') ? payment.method : 'Offline',
        sessionStartYear: payment.session_start_year || '',
        sessionEndYear: payment.session_end_year || '',
        validUntil: payment.valid_until || '',
        transactionDate: payment.transaction_date || payment.created_at || new Date().toISOString(),
        razorpayOrderId: payment.razorpay_order_id,
        razorpayPaymentId: payment.razorpay_payment_id,
        offlineTransactionId: payment.offline_transaction_id,
        approvedBy: approvedByStr
    };
}

/**
 * Build the canonical receipt payload directly from the stored payment record.
 * Display-only enrichment must not be passed here, or old receipts can fail
 * verification if profile data changes after signing.
 */
export function buildDocumentPayloadFromPayment(payment: PaymentDocumentSource): DocumentPayload {
    return buildDocumentPayload({
        payment_id: payment.payment_id,
        student_uid: payment.student_uid || '',
        student_name: payment.student_name || 'Unknown',
        student_id: payment.student_id || '',
        amount: payment.amount || 0,
        method: payment.method || 'Offline',
        session_start_year: payment.session_start_year?.toString(),
        session_end_year: payment.session_end_year?.toString(),
        valid_until: payment.valid_until || undefined,
        transaction_date: payment.transaction_date || undefined,
        created_at: payment.created_at || undefined,
        razorpay_order_id: payment.razorpay_order_id || undefined,
        razorpay_payment_id: payment.razorpay_payment_id || undefined,
        offline_transaction_id: payment.offline_transaction_id || undefined,
        approved_by: payment.approved_by,
    });
}

// ============================================================================
// PUBLIC KEY EXPORT (for client-side verification if needed)
// ============================================================================

/**
 * Get the public key for client-side verification
 * This can be exposed via an API endpoint
 */
export function getPublicKey(): string {
    const { publicKey } = getKeyPair();
    return publicKey;
}

// ============================================================================
// EXPORT SERVICE
// ============================================================================

export const DocumentCryptoService = {
    // Core operations
    hashDocumentPayload,
    signDocumentPayload,
    verifyDocumentSignature,

    // QR operations
    generateSecureQRData,
    parseSecureQRData,

    // Verification
    verifyReceiptIntegrity,

    // Helpers
    buildDocumentPayload,
    buildDocumentPayloadFromPayment,
    getPublicKey
};

export default DocumentCryptoService;
