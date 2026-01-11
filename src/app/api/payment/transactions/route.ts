import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/firebase-admin';
import { adminDb } from '@/lib/firebase-admin';
import { getAllPayments, getPaymentsByStudent } from '@/lib/payment/payment.service';
import { Timestamp } from 'firebase-admin/firestore';

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await verifyToken(token);
    const userId = decodedToken.uid;

    // Get user data to determine role
    const userDoc = await adminDb.collection('users').doc(userId).get();
    const userData = userDoc.data();

    if (!userData) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const studentId = searchParams.get('studentId');
    const studentUid = searchParams.get('studentUid');
    const year = searchParams.get('year');
    const month = searchParams.get('month');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '50');
    const paymentMethod = searchParams.get('paymentMethod') as 'Online' | 'Offline' | null;

    // Helper to map Firestore documents to frontend-expected format
    const mapToFrontend = async (p: any) => {
      if (!p) return null;

      // Helper to resolve name from user ID or email
      const resolveName = async (userId: string | undefined, emailOrName: string) => {
        if (!emailOrName || !emailOrName.includes('@')) return emailOrName;

        try {
          let userDoc;
          if (userId) {
            const docSnap = await adminDb.collection('users').doc(userId).get();
            if (docSnap.exists) userDoc = docSnap;
          }

          if (!userDoc) {
            const q = await adminDb.collection('users').where('email', '==', emailOrName).limit(1).get();
            if (!q.empty) userDoc = q.docs[0];
          }

          if (userDoc?.exists) {
            const data = userDoc.data();
            return data?.fullName || data?.name || emailOrName;
          }
        } catch (e) {
          console.error('Error resolving name:', e);
        }
        return emailOrName;
      };

      // Map approvedBy object to string if it exists
      let approvedByStr = undefined;
      if (p.approvedBy) {
        if (typeof p.approvedBy === 'object') {
          if (['Manual', 'admin', 'moderator'].includes(p.approvedBy.type)) {
            const name = await resolveName(p.approvedBy.userId, p.approvedBy.name);
            const role = p.approvedBy.role || p.approvedBy.type || 'moderator';
            const suffix = role.toLowerCase() === 'admin' ? '(ADMIN)' : `(${p.approvedBy.empId || 'STAFF'})`;
            approvedByStr = `${name} ${suffix}`;
          } else if (p.approvedBy.type === 'SYSTEM') {
            approvedByStr = 'System Verified';
          }
        } else {
          // Handle string case
          const strValue = String(p.approvedBy);
          approvedByStr = strValue;

          // Check if it's the specific "email (ID)" format (e.g. "shivdj519@gmail.com (MB-01)")
          const emailMatch = strValue.match(/^(.+?) \((.+?)\)$/);
          if (emailMatch) {
            const email = emailMatch[1];
            const idPart = emailMatch[2];

            if (email.includes('@')) {
              const name = await resolveName(undefined, email);
              if (name !== email) {
                approvedByStr = `${name} (${idPart})`;
              }
            }
          }
        }
      }

      // Robust timestamp extraction
      const getTimestamp = (val: any) => {
        if (!val) return new Date().toISOString();
        if (typeof val.toDate === 'function') return val.toDate().toISOString();
        if (val instanceof Date) return val.toISOString();
        if (typeof val === 'string') return val;
        return new Date().toISOString();
      };

      return {
        ...p,
        paymentMethod: p.method?.toLowerCase() || 'online',
        status: p.status?.toLowerCase() || 'completed',
        approvedBy: approvedByStr,
        timestamp: getTimestamp(p.createdAt || p.timestamp),
        validUntil: p.validUntil ? getTimestamp(p.validUntil) : 'N/A'
      };
    };

    // For students, they can only view their own transactions
    if (userData.role === 'student') {
      // Try to get enrollment ID for better payment lookup
      let enrollmentId = userData.enrollmentId;

      // If not in users doc, check students doc
      if (!enrollmentId) {
        try {
          const studentDoc = await adminDb.collection('students').doc(userId).get();
          if (studentDoc.exists) {
            enrollmentId = studentDoc.data()?.enrollmentId;
          }
        } catch (e) {
          console.warn('Failed to fetch student profile for enrollment ID', e);
        }
      }

      const payments = await getPaymentsByStudent(userId, enrollmentId);

      // Also fetch pending renewal requests to show in history
      const renewalRequestsSnapshot = await adminDb.collection('renewal_requests')
        .where('studentId', '==', userId)
        .where('status', '==', 'pending')
        .get();

      // Robust timestamp extraction (same as mapToFrontend)
      const getTimestamp = (val: any) => {
        if (!val) return new Date().toISOString();
        if (typeof val.toDate === 'function') return val.toDate().toISOString();
        if (val instanceof Date) return val.toISOString();
        if (typeof val === 'string') return val;
        return new Date().toISOString();
      };

      const pendingRequests = renewalRequestsSnapshot.docs.map((doc: any) => {
        const data = doc.data();
        return {
          paymentId: doc.id,
          studentId: data.enrollmentId,
          studentName: data.studentName,
          amount: data.totalFee,
          paymentMethod: 'offline',
          method: 'Offline',
          status: 'pending',
          durationYears: data.durationYears,
          timestamp: getTimestamp(data.createdAt),
          validUntil: 'Pending Approval',
          isRequest: true
        };
      });

      const processedPayments = await Promise.all(payments.map(mapToFrontend));

      const transactions = [
        ...pendingRequests,
        ...processedPayments.filter(Boolean)
      ].sort((a: any, b: any) => {
        return new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      });

      return NextResponse.json({
        success: true,
        transactions,
        total: transactions.length
      });
    }

    // For admin/moderator, allow viewing all transactions with filters
    if (['admin', 'moderator'].includes(userData.role)) {
      const result = await getAllPayments(
        {
          year: year ? parseInt(year) : undefined,
          studentId: studentId || undefined,
          studentUid: studentUid || undefined,
          method: paymentMethod || undefined
        },
        page,
        limit
      );

      return NextResponse.json({
        success: true,
        transactions: await Promise.all(result.payments.map(mapToFrontend)),
        total: result.total,
        page: result.page,
        totalPages: result.totalPages
      });
    }

    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });

  } catch (error) {
    console.error('Error fetching transactions:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
