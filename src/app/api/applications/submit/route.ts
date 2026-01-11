import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application, AuditLogEntry } from '@/lib/types/application';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await request.json();
    const { applicationId } = body;

    if (!applicationId) {
      return NextResponse.json({ error: 'Application ID required' }, { status: 400 });
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

    // Validate state - must be verified
    if (appData.state !== 'verified') {
      return NextResponse.json({ 
        error: 'Application must be verified before submission' 
      }, { status: 400 });
    }

    // Re-validate required fields server-side
    const formData = appData.formData;
    if (!formData.fullName || !formData.phoneNumber || !formData.enrollmentId ||
        !formData.department || !formData.semester || !formData.routeId || !formData.stopId ||
        !formData.paymentInfo.paymentEvidenceProvided || !formData.declarationAccepted) {
      return NextResponse.json({ 
        error: 'Incomplete application data' 
      }, { status: 400 });
    }

    // Submit application
    const submittedAt = new Date().toISOString();
    const auditEntry: AuditLogEntry = {
      actorId: uid,
      actorRole: 'student',
      action: 'application_submitted',
      timestamp: submittedAt,
      notes: 'Application submitted for admin/moderator review'
    };

    await appRef.update({
      state: 'submitted',
      submittedAt,
      submittedBy: uid,
      updatedAt: submittedAt,
      stateHistory: [...(appData.stateHistory || []), { state: 'submitted', timestamp: submittedAt, actor: uid }],
      auditLogs: [...(appData.auditLogs || []), auditEntry]
    });

    // Notify all admins and moderators
    const adminsQuery = await adminDb.collection('admins').get();
    const moderatorsQuery = await adminDb.collection('moderators').get();

    const notificationPromises = [];

    // Notify admins
    for (const adminDoc of adminsQuery.docs) {
      const notifRef = adminDb.collection('notifications').doc();
      notificationPromises.push(
        notifRef.set({
          notifId: notifRef.id,
          toUid: adminDoc.id,
          toRole: 'admin',
          type: 'Submitted',
          title: 'New Application Submitted',
          body: `${formData.fullName} (${formData.enrollmentId}) has submitted a new bus service application.`,
          links: {
            applicationId,
            reviewPage: `/admin/applications/${applicationId}`
          },
          read: false,
          createdAt: submittedAt
        })
      );
    }

    // Notify moderators
    for (const modDoc of moderatorsQuery.docs) {
      const notifRef = adminDb.collection('notifications').doc();
      notificationPromises.push(
        notifRef.set({
          notifId: notifRef.id,
          toUid: modDoc.id,
          toRole: 'moderator',
          type: 'Submitted',
          title: 'New Application Submitted',
          body: `${formData.fullName} (${formData.enrollmentId}) has submitted a new bus service application.`,
          links: {
            applicationId,
            reviewPage: `/moderator/applications/${applicationId}`
          },
          read: false,
          createdAt: submittedAt
        })
      );
    }

    await Promise.all(notificationPromises);

    // Send confirmation to student
    const studentNotifRef = adminDb.collection('notifications').doc();
    await studentNotifRef.set({
      notifId: studentNotifRef.id,
      toUid: uid,
      toRole: 'student',
      type: 'Submitted',
      title: 'Application Submitted',
      body: 'Your bus service application has been submitted successfully. You will be notified once it is reviewed.',
      links: {
        applicationId,
        statusPage: `/apply/status/${applicationId}`
      },
      read: false,
      createdAt: submittedAt
    });

    return NextResponse.json({
      success: true,
      applicationId,
      message: 'Application submitted successfully'
    });
  } catch (error: any) {
    console.error('Error submitting application:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to submit application' },
      { status: 500 }
    );
  }
}

