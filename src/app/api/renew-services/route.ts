import { NextRequest, NextResponse } from 'next/server';
import { adminDb, adminAuth } from '@/lib/firebase-admin';
import { calculateRenewalDate, toFirestoreTimestamp, formatRenewalDate } from '@/lib/utils/renewal-utils';

/**
 * POST /api/renew-services
 * Renews bus service for multiple students
 * 
 * Request body:
 * {
 *   renewals: Array<{
 *     studentUid: string;
 *     durationYears: number;
 *     amount: number;
 *   }>;
 *   paymentMode: 'manual' | 'online';
 *   transactionId?: string;
 *   adminUid: string;
 * }
 */
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    const token = authHeader.substring(7);
    
    // Verify token
    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (error) {
      console.error('❌ Token verification failed:', error);
      return NextResponse.json(
        { success: false, error: 'Invalid token' },
        { status: 401 }
      );
    }

    // Check if user is admin or moderator
    const userDoc = await adminDb.collection('users').doc(decodedToken.uid).get();
    if (!userDoc.exists) {
      return NextResponse.json(
        { success: false, error: 'User not found' },
        { status: 404 }
      );
    }

    const userData = userDoc.data();
    if (!userData || !['admin', 'moderator'].includes(userData.role)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Insufficient permissions' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { renewals, paymentMode, transactionId, adminUid } = body;

    // Validate input
    if (!renewals || !Array.isArray(renewals) || renewals.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Invalid renewals data' },
        { status: 400 }
      );
    }

    if (renewals.length > 100) {
      return NextResponse.json(
        { success: false, error: 'Cannot process more than 100 renewals at once' },
        { status: 400 }
      );
    }

    if (!paymentMode || !['manual', 'online'].includes(paymentMode)) {
      return NextResponse.json(
        { success: false, error: 'Invalid payment mode' },
        { status: 400 }
      );
    }

    // Process renewals
    const results: Array<{
      studentUid: string;
      success: boolean;
      error?: string;
      newValidUntil?: string;
    }> = [];

    const timestamp = new Date().toISOString();
    const batch = adminDb.batch();
    let batchCount = 0;
    const MAX_BATCH_SIZE = 500;

    for (const renewal of renewals) {
      const { studentUid, durationYears, amount } = renewal;

      try {
        // Validate duration
        if (!Number.isInteger(durationYears) || durationYears < 1 || durationYears > 4) {
          results.push({
            studentUid,
            success: false,
            error: 'Invalid duration (must be 1-4 years)'
          });
          continue;
        }

        // Get student document
        const studentRef = adminDb.collection('students').doc(studentUid);
        const studentDoc = await studentRef.get();

        if (!studentDoc.exists) {
          results.push({
            studentUid,
            success: false,
            error: 'Student not found'
          });
          continue;
        }

        const studentData = studentDoc.data();
        if (!studentData) {
          results.push({
            studentUid,
            success: false,
            error: 'Student data unavailable'
          });
          continue;
        }

        // Calculate new validUntil date
        const currentValidUntil = studentData.validUntil?.toDate?.()?.toISOString() || null;
        const { newValidUntil } = calculateRenewalDate(currentValidUntil, durationYears);

        // Calculate new sessionEndYear from validUntil (deadline from config: June 30th by default)
        const newValidUntilDate = new Date(newValidUntil);
        const newSessionEndYear = newValidUntilDate.getFullYear();

        // Update student document ONLY - no separate collections
        // NOTE: We don't update status here - it's derived from validUntil
        // The nightly batch job will sync status field for admin filtering
        batch.update(studentRef, {
          validUntil: toFirestoreTimestamp(newValidUntil),
          durationYears: durationYears, // Store the renewed duration
          sessionEndYear: newSessionEndYear, // Update session end year based on new validUntil
          updatedAt: toFirestoreTimestamp(timestamp),
          // Update payment information for renewal
          paymentAmount: amount, // Update with the renewal amount
          paid_on: timestamp // Update with current renewal date
        });
        batchCount++;

        // Commit batch if reaching limit
        if (batchCount >= MAX_BATCH_SIZE) {
          await batch.commit();
          console.log(`✅ Committed batch of ${batchCount} operations`);
          batchCount = 0;
        }

        results.push({
          studentUid,
          success: true,
          newValidUntil
        });

        console.log(`✅ Renewed service for ${studentData.fullName || studentData.name}: ${currentValidUntil ? formatRenewalDate(currentValidUntil) : 'Expired'} → ${formatRenewalDate(newValidUntil)}`);

      } catch (error: any) {
        console.error(`❌ Error renewing service for ${studentUid}:`, error);
        results.push({
          studentUid,
          success: false,
          error: error.message || 'Unknown error'
        });
      }
    }

    // Commit final batch
    if (batchCount > 0) {
      await batch.commit();
      console.log(`✅ Committed final batch of ${batchCount} operations`);
    }

    // Summary
    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;
    
    console.log(`🎉 Renewal process completed: ${successCount} success, ${failCount} failed`);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: renewals.length,
        successful: successCount,
        failed: failCount
      }
    });

  } catch (error: any) {
    console.error('❌ Error processing renewals:', error);
    return NextResponse.json(
      { success: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
