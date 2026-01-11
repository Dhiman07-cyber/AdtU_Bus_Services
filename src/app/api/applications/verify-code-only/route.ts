import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
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
    const { codeId, code } = body;

    if (!codeId || !code) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get verification code
    const codeRef = adminDb.collection('verificationCodes').doc(codeId);
    const codeDoc = await codeRef.get();

    if (!codeDoc.exists) {
      return NextResponse.json({ error: 'Verification code not found' }, { status: 404 });
    }

    const codeData = codeDoc.data();

    if (codeData?.studentUid !== uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    if (codeData?.used) {
      return NextResponse.json({ 
        verified: false,
        error: 'Verification code has already been used',
        errorType: 'ALREADY_USED',
        message: 'This verification code has already been used. Please request a new code.'
      }, { status: 400 });
    }

    if (codeData?.expiresAt < new Date().toISOString()) {
      return NextResponse.json({ 
        verified: false,
        error: 'Verification code has expired',
        errorType: 'EXPIRED',
        message: 'Your verification code has expired. Please request a new code to continue.',
        canResend: true
      }, { status: 400 });
    }

    if (codeData?.attempts >= codeData?.maxAttempts) {
      return NextResponse.json({ 
        verified: false,
        error: 'Maximum verification attempts exceeded',
        errorType: 'MAX_ATTEMPTS',
        message: 'Too many incorrect attempts. Please request a new verification code.',
        canResend: true
      }, { status: 400 });
    }

    // Verify the code
    const inputCodeHash = hashCode(code);
    const isValid = inputCodeHash === codeData?.codeHash;

    // Update attempts
    await codeRef.update({
      attempts: (codeData?.attempts || 0) + 1,
      lastAttemptAt: new Date().toISOString()
    });

    if (!isValid) {
      return NextResponse.json({ 
        verified: false, 
        message: 'Invalid verification code',
        attemptsRemaining: (codeData?.maxAttempts || 5) - (codeData?.attempts || 0) - 1
      });
    }

    // Mark code as used
    await codeRef.update({
      used: true,
      usedAt: new Date().toISOString()
    });

    // Delete related notification after successful verification
    const notificationsQuery = await adminDb.collection('notifications')
      .where('links.verificationCodeId', '==', codeId)
      .get();

    const batch = adminDb.batch();
    notificationsQuery.docs.forEach((doc) => {
      batch.delete(doc.ref);
    });

    if (!notificationsQuery.empty) {
      await batch.commit();
      console.log(`🗑️ Deleted ${notificationsQuery.size} notification(s) after successful verification`);
    }

    return NextResponse.json({
      verified: true,
      message: 'Verification successful'
    });
  } catch (error: any) {
    console.error('Error verifying code:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to verify code' },
      { status: 500 }
    );
  }
}
