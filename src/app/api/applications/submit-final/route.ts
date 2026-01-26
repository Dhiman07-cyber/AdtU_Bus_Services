import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application, ApplicationFormData } from '@/lib/types/application';

export async function POST(request: NextRequest) {
  try {
    console.log('🔄 Submit-final API called');

    // Check if Firebase Admin is properly initialized
    if (!adminAuth || !adminDb) {
      console.error('❌ Firebase Admin not initialized');
      return NextResponse.json({ error: 'Firebase Admin not initialized' }, { status: 500 });
    }

    const token = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('🔍 Verifying token...');
    let uid, email;

    // Handle test token for development
    if (token === 'test') {
      console.log('🔧 Using test token for development');
      uid = 'test-user-id';
      email = 'test@example.com';
    } else {
      try {
        const decodedToken = await adminAuth.verifyIdToken(token);
        uid = decodedToken.uid;
        email = decodedToken.email;
        console.log('✅ Token verified successfully:', { uid, email });
      } catch (tokenError) {
        console.error('❌ Token verification failed:', tokenError);
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }
    }

    let body;
    try {
      body = await request.json();
      console.log('📦 Request body parsed successfully');
    } catch (error) {
      console.error('❌ Failed to parse request body:', error);
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    const { formData, verificationCodeId, needsCapacityReview } = body;
    console.log('📋 Extracted data:', { hasFormData: !!formData, hasVerificationCodeId: !!verificationCodeId, needsCapacityReview });

    const isOnlinePayment = formData?.paymentInfo?.paymentMode === 'online';
    console.log('💳 Payment mode:', formData?.paymentInfo?.paymentMode, 'Is online:', isOnlinePayment);

    if (!formData || (!verificationCodeId && !isOnlinePayment)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Verify the verification code was used (skip for online payment check and test mode)
    let codeData = null;
    let codeRef = null;

    if (token !== 'test' && !isOnlinePayment) {
      codeRef = adminDb.collection('verificationCodes').doc(verificationCodeId);
      const codeDoc = await codeRef.get();

      if (!codeDoc.exists) {
        console.log('❌ Verification code not found:', verificationCodeId);
        return NextResponse.json({ error: 'Verification code not found' }, { status: 404 });
      }

      codeData = codeDoc.data();
      if (codeData?.studentUid !== uid) {
        console.log('❌ Verification code does not belong to this user:', { studentUid: codeData?.studentUid, uid });
        return NextResponse.json({ error: 'Verification code does not belong to this user' }, { status: 400 });
      }

      // Check if code is used (it should be used after verification)
      if (!codeData?.used) {
        console.log('❌ Verification code not used yet:', { used: codeData?.used });
        return NextResponse.json({ error: 'Please verify your code first before submitting' }, { status: 400 });
      }
      console.log('✅ Verification code validated successfully');
    } else {
      console.log('🔧 Skipping verification code check (Test mode or Online Payment)');
    }

    const now = new Date().toISOString();

    // Save to applications collection for admin/moderator review
    const appRef = adminDb.collection('applications').doc(uid);

    const applicationData = {
      applicationId: uid,
      applicantUid: uid,
      email: email || formData.email,
      state: 'submitted',
      formData: formData,
      submittedAt: now,
      createdAt: now,
      updatedAt: now,

      // Top-level promoted fields (Essential Identity & requested Bus/Route/Stop)
      fullName: formData.fullName || '',
      enrollmentId: formData.enrollmentId || '',

      // Service details (Requested)
      routeId: formData.routeId || '',
      busId: formData.busId || '',
      busAssigned: formData.busAssigned || '',
      stopId: formData.stopId || '',
      shift: formData.shift || '',

      verificationCodeId: verificationCodeId || '',
      verifiedBy: isOnlinePayment ? 'system_online_payment' : (codeData?.moderatorUid || ''),
      verifiedAt: now,
      // Flag for admin to know if this application needs capacity review before approval
      needsCapacityReview: needsCapacityReview === true
    };

    console.log('💾 Saving application to Firestore...');
    await appRef.set(applicationData);
    console.log('✅ Application saved successfully to applications collection');

    // Delete verification code after successful submission (only if it exists)
    if (codeRef) {
      await codeRef.delete();
      console.log('🗑️ Verification code deleted');
    }

    // Also delete related notification if verification code exists
    if (verificationCodeId) {
      const notificationsQuery = await adminDb.collection('notifications')
        .where('links.verificationCodeId', '==', verificationCodeId)
        .get();

      if (!notificationsQuery.empty) {
        const batch = adminDb.batch();
        notificationsQuery.docs.forEach((doc: any) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`🗑️ Deleted ${notificationsQuery.size} notification(s) after successful verification`);
      }
    }

    // ✅ SERVER-SIDE NOTIFICATION: Notify admins if bus is full or near capacity
    // This replaces the broken client-side calls that were causing "Failed to fetch"
    if (needsCapacityReview === true) {
      try {
        console.log('🚨 Application needs capacity review. Notifying admins...');

        // Fetch all admin and moderator IDs for notification
        const adminsSnapshot = await adminDb.collection('admins').get();
        const modsSnapshot = await adminDb.collection('moderators').get();

        const recipientIds = [
          ...adminsSnapshot.docs.map((doc: any) => doc.id),
          ...modsSnapshot.docs.map((doc: any) => doc.id)
        ];

        if (recipientIds.length > 0) {
          const nowTimestamp = new Date().toISOString();
          const batch = adminDb.batch();

          recipientIds.forEach(recipientId => {
            const notifRef = adminDb.collection('notifications').doc();
            batch.set(notifRef, {
              toUid: recipientId,
              title: '🚨 Bus Capacity Alert - Overloaded Bus Request',
              content: `A new application from **${formData.fullName}** (${formData.enrollmentId}) needs review because the selected bus (**${formData.busAssigned || formData.busId}**) is at full capacity.`,
              type: 'capacity_alert',
              createdAt: nowTimestamp,
              isRead: false,
              links: {
                applicationId: uid,
                routeId: formData.routeId
              },
              sender: {
                name: 'System',
                role: 'system'
              }
            });
          });

          await batch.commit();
          console.log(`✅ Capacity notifications sent to ${recipientIds.length} staff members`);
        }
      } catch (notifError) {
        console.error('⚠️ Failed to send capacity notifications:', notifError);
        // Don't fail the whole submission just because a notification failed
      }
    }

    console.log('🎉 Application submission completed successfully for UID:', uid);
    return NextResponse.json({
      success: true,
      applicationId: uid,
      message: 'Application submitted successfully and waiting for approval'
    });
  } catch (error: any) {
    console.error('❌ CRITICAL ERROR in submit-final API:', error);
    console.error('Diagnostic Info:', {
      name: error.name,
      message: error.message,
      stack: error.stack
    });
    return NextResponse.json(
      {
        error: error.message || 'Failed to submit application',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
