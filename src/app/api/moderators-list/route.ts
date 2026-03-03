import { NextRequest, NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';
import { verifyTokenOnly } from '@/lib/security/api-auth';

export async function GET(request: NextRequest) {
  try {
    // SECURITY: Require authentication (any authenticated user can see the list)
    const user = await verifyTokenOnly(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    if (!adminDb) {
      return NextResponse.json([], { status: 200 });
    }

    const moderatorsRef = adminDb.collection('moderators');
    const querySnapshot = await moderatorsRef.get();

    const moderators: any[] = [];
    querySnapshot.forEach((doc: any) => {
      const data = doc.data();
      // Check if moderator has permission to appear in the list
      const permissions = data.permissions;
      const canAppearInList = !permissions || permissions.canAppearInModeratorList !== false;

      if (canAppearInList) {
        moderators.push({
          id: doc.id,
          name: data.fullName || data.name || '',
        });
      }
    });

    return NextResponse.json(moderators);
  } catch (error) {
    console.error('Error fetching moderators:', error);
    return NextResponse.json({ error: 'Failed to fetch moderators' }, { status: 500 });
  }
}