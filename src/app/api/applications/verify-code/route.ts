import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application, AuditLogEntry, VerificationCode } from '@/lib/types/application';
import * as crypto from 'crypto';

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
    const { applicationId, code } = body;

    if (!applicationId || !code) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    if (code.length !== 6 || !/^\d{6}$/.test(code)) {
      return NextResponse.json({ error: 'Invalid code format' }, { status: 400 });
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

    if (appData.state !== 'awaiting_verification') {
      return NextResponse.json({ 
        error: 'Application is not awaiting verification' 
      }, { status: 400 });
    }

    // Find the active verification code
    const codesQuery = await adminDb.collection('verificationCodes')
      .where('applicationId', '==', applicationId)
      .where('used', '==', false)
      .orderBy('generatedAt', 'desc')
      .limit(1)
      .get();

    if (codesQuery.empty) {
      return NextResponse.json({ 
        verified: false,
        message: 'No active verification code found. Please request a new code.' 
      }, { status: 400 });
    }

    const codeDoc = codesQuery.docs[0];
    const codeData = codeDoc.data() as VerificationCode;

    // Check if code has expired
    const now = new Date();
    const expiryDate = new Date(codeData.expiresAt);
    if (now > expiryDate) {
      return NextResponse.json({ 
        verified: false,
        message: 'Verification code has expired. Please request a new code.' 
      }, { status: 400 });
    }

    // Check if max attempts exceeded
    if (codeData.attempts >= codeData.maxAttempts) {
      await codeDoc.ref.update({ used: true, exceededAttempts: true });
      return NextResponse.json({ 
        verified: false,
        message: 'Maximum verification attempts exceeded. Please request a new code.' 
      }, { status: 400 });
    }

    // Verify the code
    const codeHash = hashCode(code);
    const isValid = codeHash === codeData.codeHash;

    // Increment attempts
    await codeDoc.ref.update({
      attempts: codeData.attempts + 1
    });

    if (!isValid) {
      const remainingAttempts = codeData.maxAttempts - (codeData.attempts + 1);
      return NextResponse.json({ 
        verified: false,
        message: `Invalid code. ${remainingAttempts} attempts remaining.` 
      }, { status: 400 });
    }

    // Code is valid - mark as used
    await codeDoc.ref.update({
      used: true,
      usedAt: new Date().toISOString()
    });

    // Update application state to verified
    const verifiedAt = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      actorId: uid,
      actorRole: 'student',
      action: 'verification_success',
      timestamp: verifiedAt,
      notes: `Verification successful via moderator ${codeData.moderatorName}`,
      metadata: { codeId: codeData.codeId, moderatorUid: codeData.moderatorUid }
    };

    await appRef.update({
      state: 'verified',
      verifiedAt,
      verifiedBy: codeData.moderatorName,
      verifiedById: codeData.moderatorUid,
      updatedAt: verifiedAt,
      stateHistory: [...(appData.stateHistory || []), { state: 'verified', timestamp: verifiedAt, actor: codeData.moderatorUid }],
      auditLogs: [...(appData.auditLogs || []), auditEntry]
    });

    // Send success notification to student
    const notifRef = adminDb.collection('notifications').doc();
    await notifRef.set({
      notifId: notifRef.id,
      toUid: uid,
      toRole: 'student',
      type: 'VerificationSuccess',
      title: 'Verification Successful',
      body: 'Your payment has been verified. You can now submit your application.',
      links: {
        applicationId
      },
      read: false,
      createdAt: verifiedAt
    });

    // Notify moderator
    const modNotifRef = adminDb.collection('notifications').doc();
    await modNotifRef.set({
      notifId: modNotifRef.id,
      toUid: codeData.moderatorUid,
      toRole: 'moderator',
      type: 'CodeVerified',
      title: 'Verification Code Used',
      body: `${appData.formData.fullName} has successfully entered the verification code.`,
      links: {
        applicationId
      },
      read: false,
      createdAt: verifiedAt
    });

    return NextResponse.json({
      success: true,
      verified: true,
      message: 'Verification successful! You can now submit your application.'
    });
  } catch (error: any) {
    console.error('Error verifying code:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify code' },
      { status: 500 }
    );
  }
}

