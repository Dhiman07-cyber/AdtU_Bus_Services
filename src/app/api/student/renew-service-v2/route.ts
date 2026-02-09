import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase-admin';
import { adminDb, FieldValue } from '@/lib/firebase-admin';
import { createRazorpayOrder } from '@/lib/payment/razorpay.service';
import { getCurrentBusFee } from '@/lib/bus-fee-service';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await verifyToken(token);
    const userId = decodedToken.uid;

    const body = await request.json();
    const {
      durationYears,
      // totalFee, // Ignored: Fetch from source of truth
      paymentMode,
      transactionId, // For offline payments
      receiptImageUrl // For offline payments
    } = body;

    if (!durationYears || !paymentMode) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Get student document
    const studentDoc = await adminDb.collection('students').doc(userId).get();
    if (!studentDoc.exists) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Fetch current bus fee from Firestore (Source of Truth)
    const busFeeData = await getCurrentBusFee();
    const currentBusFee = busFeeData.amount;

    // Calculate authoritative total fee
    const totalFee = currentBusFee * durationYears;

    console.log(`💰 Calculating renewal fee for ${userId}: ${currentBusFee} x ${durationYears} = ${totalFee}`);

    const studentData = studentDoc.data()!;
    const enrollmentId = studentData.enrollmentId;
    const studentName = studentData.fullName;

    if (paymentMode === 'online') {
      // Create Razorpay order
      const receipt = `renewal_${enrollmentId}_${Date.now()}`;
      const order = await createRazorpayOrder(
        totalFee, // Use authoritative fee
        receipt,
        {
          studentId: userId,
          enrollmentId,
          studentName,
          durationYears: durationYears.toString(),
          type: 'renewal'
        }
      );

      // Return order details for client-side payment
      return NextResponse.json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
      });

    } else if (paymentMode === 'offline') {
      // Create renewal request for offline payment
      const renewalRequestData = {
        studentId: userId,
        enrollmentId,
        studentName,
        durationYears,
        totalFee, // Use authoritative fee
        transactionId: transactionId || '',
        receiptImageUrl: receiptImageUrl || '',
        paymentMode: 'offline',
        status: 'pending',
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp()
      };

      const docRef = await adminDb.collection('renewal_requests').add(renewalRequestData);

      console.log('📬 CREATING RENEWAL REQUEST NOTIFICATION');
      console.log('Student:', studentName, `(${enrollmentId})`);
      console.log('Duration:', durationYears, 'years');

      // Fetch all admins and moderators to send notification
      const adminsSnapshot = await adminDb.collection('admins').get();
      const moderatorsSnapshot = await adminDb.collection('moderators').get();

      const adminIds = adminsSnapshot.docs.map((doc: any) => doc.id);
      const moderatorIds = moderatorsSnapshot.docs.map((doc: any) => doc.id);
      const allStaffIds = [...adminIds, ...moderatorIds];

      console.log('Notifying:', adminIds.length, 'admins and', moderatorIds.length, 'moderators');
      console.log('Total recipients:', allStaffIds.length);

      // Create notification for admins/moderators ONLY (not for student)
      // Calculate expiry (1 day from now)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 1);
      expiryDate.setHours(23, 59, 59, 999);

      await adminDb.collection('notifications').add({
        title: '🔄 New Renewal Request',
        content: `${studentName} (${enrollmentId}) has submitted an offline renewal request for ${durationYears} year(s).`,
        sender: {
          userId,
          userName: studentName,
          userRole: 'student',
          enrollmentId
        },
        target: {
          type: 'specific_users',
          specificUserIds: allStaffIds
        },
        recipientIds: allStaffIds,
        autoInjectedRecipientIds: [],
        readByUserIds: [],
        isEdited: false,
        isDeletedGlobally: false,
        createdAt: FieldValue.serverTimestamp(),
        expiresAt: expiryDate.toISOString()
      });

      console.log('✅ Renewal request notification created for admins/moderators only');

      return NextResponse.json({
        success: true,
        message: 'Offline renewal request submitted successfully',
        requestId: docRef.id
      });
    }

    return NextResponse.json({ error: 'Invalid payment mode' }, { status: 400 });

  } catch (error) {
    console.error('Renewal service error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
