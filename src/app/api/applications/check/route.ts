import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    // The application document id IS the student uid (one application per student,
    // enforced by submit-final). Read it directly so the status gate is
    // deterministic and can never return a stale/secondary doc.
    const appDoc = await adminDb.collection('applications').doc(uid).get();

    if (!appDoc.exists) {
      return NextResponse.json({
        hasApplication: false
      });
    }

    const appData = appDoc.data();

    return NextResponse.json({
      hasApplication: true,
      applicationId: appData?.applicationId || uid,
      state: appData?.state,
      // Phase 2: surface categorisation so the apply UI can explain an
      // "upcoming" application that is intentionally waiting for eligibility.
      applicationType: appData?.applicationType ?? 'fresh',
      eligibleApproval: appData?.eligibleApproval ?? null
    });
  } catch (error: any) {
    console.error('Error checking application:', error);
    return NextResponse.json(
      { error: 'Failed to check application' },
      { status: 500 }
    );
  }
}

