import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { VerificationCode } from '@/lib/types/application';
import * as crypto from 'crypto';

// Rate limiting: max 3 codes per 24 hours per user
const MAX_CODES_PER_DAY = 3;
const CODE_EXPIRY_MINUTES = 2;

function generateVerificationCode(): string {
  // Generate a cryptographically secure 6-digit code
  const code = crypto.randomInt(0, 1000000);
  return code.toString().padStart(6, '0');
}

function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await request.json();
    const { formData, moderatorUid } = body;

    if (!formData || !moderatorUid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get moderator details
    const modRef = adminDb.collection('moderators').doc(moderatorUid);
    const modDoc = await modRef.get();

    if (!modDoc.exists) {
      return NextResponse.json({ error: 'Moderator not found' }, { status: 404 });
    }

    const modData = modDoc.data();
    const moderatorName = `${modData?.name} ${modData?.empId}`;

    // Check rate limiting (per user, not per application)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentCodesQuery = await adminDb.collection('verificationCodes')
      .where('studentUid', '==', uid)
      .where('generatedAt', '>=', oneDayAgo)
      .get();

    if (recentCodesQuery.size >= MAX_CODES_PER_DAY) {
      return NextResponse.json({
        error: `Rate limit exceeded. Maximum ${MAX_CODES_PER_DAY} verification requests per 24 hours.`
      }, { status: 429 });
    }

    // Invalidate any existing active codes for this user
    const existingCodesQuery = await adminDb.collection('verificationCodes')
      .where('studentUid', '==', uid)
      .where('used', '==', false)
      .get();

    const batch = adminDb.batch();
    existingCodesQuery.docs.forEach((doc: any) => {
      batch.update(doc.ref, { used: true, invalidatedAt: new Date().toISOString() });
    });
    await batch.commit();

    // Generate new verification code
    const plainCode = generateVerificationCode();
    const codeHash = hashCode(plainCode);
    const now = new Date().toISOString();
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000).toISOString();

    const codeRef = adminDb.collection('verificationCodes').doc();
    const codeId = codeRef.id;

    // Simplified flattened data for verification
    const verificationCode: VerificationCode = {
      codeId,
      applicationId: null,
      studentUid: uid,
      moderatorUid,
      moderatorName,
      codeHash,
      code: plainCode, // Store plain code for moderator display
      codeLength: 6,
      generatedAt: now,
      expiresAt,
      used: false,
      attempts: 0,
      maxAttempts: 5,

      // Essential Display Data
      studentName: formData.fullName || '',
      enrollmentId: formData.enrollmentId || '',
      amount: formData.paymentInfo?.amountPaid || 0,
      paymentMode: formData.paymentInfo?.paymentMode || '',
      paymentReference: formData.paymentInfo?.paymentReference || '',
      shift: formData.shift || ''
    };

    await codeRef.set(verificationCode);

    // Send minimal notification to moderator
    const notifRef = adminDb.collection('notifications').doc();
    await notifRef.set({
      notifId: notifRef.id,
      toUid: moderatorUid,
      toRole: 'moderator',
      type: 'VerificationRequested',
      title: 'New Verification Request',
      body: `${formData.fullName} (${formData.enrollmentId}) has requested verification for ${formData.paymentInfo?.paymentMode === 'online' ? 'Online' : 'Offline'} payment of ₹${formData.paymentInfo?.amountPaid || 0}. UPI ID: ${formData.paymentInfo?.paymentReference || 'N/A'}`,
      links: {
        verificationCodeId: codeId,
        moderatorPanel: `/moderator/applications` // Will show in Student Verification section
      },
      read: false,
      createdAt: now,
      // Store only the plain code for moderator to see (needed for UI display)
      verificationCode: plainCode
      // Removed redundant applicationDetails - data is already in verificationCodes collection
    });

    return NextResponse.json({
      success: true,
      codeId,
      expiresAt,
      message: 'Verification code sent to moderator. Please visit the Bus Office.'
    });
  } catch (error: any) {
    console.error('Error sending verification code:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to send verification code' },
      { status: 500 }
    );
  }
}
