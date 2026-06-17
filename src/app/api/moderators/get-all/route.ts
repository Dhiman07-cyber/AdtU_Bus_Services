import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyApiAuth } from '@/lib/security/api-auth';

export async function GET(request: NextRequest) {
  try {
    const auth = await verifyApiAuth(request, ['admin']);
    if (!auth.authenticated) return auth.response;

    if (!adminDb) {
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    const moderatorsQuery = await adminDb.collection('moderators').get();

    const moderators = moderatorsQuery.docs
      .filter((doc: any) => {
        const data = doc.data();
        const hasValidData = data.email && (data.name || data.fullName);
        const isActive = hasValidData && (!data.status || data.status === 'active' || data.active === true);
        const permissions = data.permissions;
        const canAppearInList = !permissions || permissions.canAppearInModeratorList !== false;

        return isActive && canAppearInList;
      })
      .map((doc: any) => {
        const data = doc.data();
        return {
          moderatorUid: doc.id,
          name: data.name || data.fullName || 'Unknown Moderator',
          empId: data.employeeId || data.empId || data.staffId || data.emp_id || 'N/A',
          role: 'moderator',
          active: data.active || data.status === 'active' || !data.status,
        };
      });

    return NextResponse.json({
      success: true,
      moderators,
    });
  } catch (error: any) {
    console.error('Error fetching moderators:', error);
    return NextResponse.json(
      { error: 'Failed to fetch moderators' },
      { status: 500 }
    );
  }
}
