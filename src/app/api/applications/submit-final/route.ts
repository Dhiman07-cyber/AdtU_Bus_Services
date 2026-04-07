import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { Application, ApplicationFormData } from '@/lib/types/application';
import { generateOfflinePaymentId } from '@/lib/types/payment';
import { PaymentTransactionService } from '@/lib/payment/payment-transaction.service';

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

    try {
      const decodedToken = await adminAuth.verifyIdToken(token);
      uid = decodedToken.uid;
      email = decodedToken.email;
      console.log('✅ Token verified successfully:', { uid, email });
    } catch (tokenError) {
      console.error('❌ Token verification failed:', tokenError);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    let body;
    try {
      body = await request.json();
      console.log('📦 Request body parsed successfully');
    } catch (error) {
      console.error('❌ Failed to parse request body:', error);
      return NextResponse.json({ error: 'Invalid JSON in request body' }, { status: 400 });
    }

    let { formData, needsCapacityReview } = body;
    console.log('📋 Extracted data:', { hasFormData: !!formData, needsCapacityReview });

    // Strip age from formData if it exists
    if (formData && 'age' in formData) {
      const { age: omittedAge, ...rest } = formData;
      formData = rest;
    }

    const isOnlinePayment = formData?.paymentInfo?.paymentMode === 'online';
    console.log('💳 Payment mode:', formData?.paymentInfo?.paymentMode, 'Is online:', isOnlinePayment);

    if (!formData) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Since moderator verification is removed, we no longer check verificationCodeId.
    // Applications are submitted directly and marked as 'submitted' for admin review.
    let codeData = null;
    let codeRef = null;

    const now = new Date().toISOString();

    // Save to applications collection for admin/moderator review
    const appRef = adminDb.collection('applications').doc(uid);

    // Generate paymentId for Supabase record
    const paymentId = isOnlinePayment ? (formData.paymentInfo?.razorpayPaymentId || '') : generateOfflinePaymentId('new_registration');

    // Create PENDING payment in Supabase Ledger immediately for offline payments
    if (!isOnlinePayment && formData?.paymentInfo?.amountPaid > 0) {
      try {
        await PaymentTransactionService.saveTransaction({
          studentId: formData.enrollmentId || 'N/A',
          studentName: formData.fullName || 'N/A',
          userId: uid, // Firestore UID
          amount: Number(formData.paymentInfo.amountPaid),
          paymentMethod: 'offline',
          paymentId,
          timestamp: now,
          durationYears: formData.sessionInfo?.durationYears || 1,
          validUntil: '', // To be filled on approval
          status: 'pending'
        });
        console.log(`✅ Pending offline registration ledger created in Supabase: ${paymentId}`);
      } catch (supabaseError) {
        console.error('⚠️ Failed to create Supabase ledger (non-fatal):', supabaseError);
      }
    }

    // Strip age from formData before saving to Firestore
    const { age: omittedAge, ...formDataWithoutAge } = formData;

    const applicationData = {
      applicationId: uid,
      applicantUid: uid,
      email: email || formData.email,
      state: 'submitted',
      formData: {
        ...formDataWithoutAge,
        paymentId // Inject generated paymentId into formData for retrieval during approval
      },
      paymentId, // Store at top level too for easy access
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

      verificationCodeId: '',
      verifiedBy: isOnlinePayment ? 'system_online_payment' : 'system_offline_submission_bypass',
      verifiedAt: now,
      // Flag for admin to know if this application needs capacity review before approval
      needsCapacityReview: needsCapacityReview === true
    };

    console.log('💾 Saving application to Firestore...');
    await appRef.set(applicationData);
    console.log('✅ Application saved successfully to applications collection');

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
      message: 'Internal error',
      stack: error.stack
    });
    return NextResponse.json(
      {
        error: 'Failed to submit application',
        details: undefined
      },
      { status: 500 }
    );
  }
}
