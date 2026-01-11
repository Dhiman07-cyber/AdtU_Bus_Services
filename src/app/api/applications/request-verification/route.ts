import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application, AuditLogEntry, VerificationCode } from '@/lib/types/application';
import * as crypto from 'crypto';

// Rate limiting: max 3 codes per 24 hours per application
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
    const { applicationId, moderatorUid } = body;

    if (!applicationId || !moderatorUid) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get application
    const appRef = adminDb.collection('applications').doc(applicationId);
    const appDoc = await appRef.get();

    if (!appDoc.exists) {
      return NextResponse.json({ error: 'Application not found' }, { status: 404 });
    }

    const appData = appDoc.data() as Application;

    if (appData.applicantUid !== uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    // Validate application state
    if (!['draft', 'awaiting_verification'].includes(appData.state)) {
      return NextResponse.json({ 
        error: 'Cannot request verification in current state' 
      }, { status: 400 });
    }

    // Check if payment evidence is provided
    if (!appData.formData.paymentInfo.paymentEvidenceProvided) {
      return NextResponse.json({ 
        error: 'Payment evidence must be provided before verification' 
      }, { status: 400 });
    }

    // Get moderator details
    const modRef = adminDb.collection('moderators').doc(moderatorUid);
    const modDoc = await modRef.get();

    if (!modDoc.exists) {
      return NextResponse.json({ error: 'Moderator not found' }, { status: 404 });
    }

    const modData = modDoc.data();
    const moderatorName = `${modData?.name} ${modData?.empId}`;

    // Check rate limiting
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const recentCodesQuery = await adminDb.collection('verificationCodes')
      .where('applicationId', '==', applicationId)
      .where('generatedAt', '>=', oneDayAgo)
      .get();

    if (recentCodesQuery.size >= MAX_CODES_PER_DAY) {
      return NextResponse.json({ 
        error: `Rate limit exceeded. Maximum ${MAX_CODES_PER_DAY} verification requests per 24 hours.` 
      }, { status: 429 });
    }

    // Invalidate any existing active codes for this application
    const existingCodesQuery = await adminDb.collection('verificationCodes')
      .where('applicationId', '==', applicationId)
      .where('used', '==', false)
      .get();

    const batch = adminDb.batch();
    existingCodesQuery.docs.forEach(doc => {
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

    const verificationCode: VerificationCode = {
      codeId,
      applicationId,
      studentUid: uid,
      moderatorUid,
      moderatorName,
      codeHash,
      codeLength: 6,
      generatedAt: now,
      expiresAt,
      used: false,
      attempts: 0,
      maxAttempts: 5
    };

    await codeRef.set(verificationCode);

    // Update application
    const auditEntry: AuditLogEntry = {
      actorId: uid,
      actorRole: 'student',
      action: 'verification_requested',
      timestamp: now,
      notes: `Verification code generated and sent to moderator ${moderatorName}`,
      metadata: { codeId, expiresAt }
    };

    await appRef.update({
      state: 'awaiting_verification',
      pendingVerifier: moderatorName,
      updatedAt: now,
      stateHistory: [...(appData.stateHistory || []), { state: 'awaiting_verification', timestamp: now, actor: uid }],
      auditLogs: [...(appData.auditLogs || []), auditEntry]
    });

    // Send notification to moderator
    const notifRef = adminDb.collection('notifications').doc();
    await notifRef.set({
      notifId: notifRef.id,
      toUid: moderatorUid,
      toRole: 'moderator',
      type: 'VerificationRequested',
      title: 'New Verification Request',
      body: `${appData.formData.fullName} (${appData.formData.enrollmentId}) has requested payment verification.`,
      links: {
        applicationId,
        moderatorPanel: `/moderator/verifications/${applicationId}`
      },
      read: false,
      createdAt: now,
      // Store only the plain code for moderator to see (needed for UI display)
      verificationCode: plainCode
      // Removed redundant applicationDetails - data is already in applications collection
    });

    return NextResponse.json({
      success: true,
      codeId,
      expiresAt,
      message: 'Verification code sent to moderator. Please visit the Bus Office.'
    });
  } catch (error: any) {
    console.error('Error requesting verification:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to request verification' },
      { status: 500 }
    );
  }
}

