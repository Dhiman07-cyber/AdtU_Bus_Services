import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function GET(request: NextRequest) {
  try {
    console.log('📋 Moderators API called');
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      console.error('❌ No token provided');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!adminAuth) {
      console.error('❌ Admin Auth not initialized');
      return NextResponse.json({ error: 'Authentication service unavailable' }, { status: 503 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    console.log('✅ Token verified for user:', decodedToken.uid);

    // Check if adminDb is available
    if (!adminDb) {
      console.error('❌ Admin Firestore not initialized');
      return NextResponse.json({ error: 'Database service unavailable' }, { status: 503 });
    }

    // Get all active moderators from moderators collection
    console.log('🔍 Fetching moderators from moderators collection');
    const moderatorsQuery = await adminDb.collection('moderators').get();
    console.log('📊 Found', moderatorsQuery.docs.length, 'moderator documents');

    const moderators = moderatorsQuery.docs
      .filter((doc: any) => {
        const data = doc.data();
        // For moderators, we'll consider them active if:
        // 1. They don't have a status field (default to active)
        // 2. They have status === 'active' 
        // 3. They have active === true
        // 4. They have a valid email and name (basic validation)
        const hasValidData = data.email && (data.name || data.fullName);
        const isActive = hasValidData && (!data.status || data.status === 'active' || data.active === true);

        // Check if moderator has permission to appear in the list (default: true for backward compatibility)
        const permissions = data.permissions;
        const canAppearInList = !permissions || permissions.canAppearInModeratorList !== false;

        console.log(`📋 Moderator ${doc.id}:`, {
          name: data.name || data.fullName,
          status: data.status,
          active: data.active,
          hasValidData,
          isActive,
          canAppearInList,
          email: data.email
        });
        return isActive && canAppearInList;
      })
      .map((doc: any) => {
        const data = doc.data();
        const moderator = {
          moderatorUid: doc.id,
          name: data.name || data.fullName || 'Unknown Moderator',
          empId: data.employeeId || data.empId || data.staffId || data.emp_id || 'N/A',
          email: data.email,
          phoneNumber: data.phone || data.phoneNumber,
          role: 'moderator',
          active: data.active || data.status === 'active' || !data.status
        };
        console.log('✅ Active moderator:', moderator);
        return moderator;
      });

    console.log('📊 Returning', moderators.length, 'active moderators');
    return NextResponse.json({
      success: true,
      moderators
    });
  } catch (error: any) {
    console.error('Error fetching moderators:', error);
    return NextResponse.json(
      { error: 'Failed to fetch moderators' },
      { status: 500 }
    );
  }
}

