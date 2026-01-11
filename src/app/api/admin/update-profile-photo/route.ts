import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    
    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const decodedToken = await adminAuth.verifyIdToken(token);
    const uid = decodedToken.uid;

    const body = await request.json();
    const { studentUid, newProfilePhotoUrl } = body;

    if (!studentUid || !newProfilePhotoUrl) {
      return NextResponse.json({ 
        error: 'Student UID and new profile photo URL are required' 
      }, { status: 400 });
    }

    // Verify user is admin or moderator
    const adminDoc = await adminDb.collection('admins').doc(uid).get();
    const modDoc = await adminDb.collection('moderators').doc(uid).get();
    
    if (!adminDoc.exists && !modDoc.exists) {
      return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 });
    }

    // Update student document
    const studentRef = adminDb.collection('students').doc(studentUid);
    const studentDoc = await studentRef.get();

    if (!studentDoc.exists) {
      return NextResponse.json({ error: 'Student not found' }, { status: 404 });
    }

    // Update the profile photo URL
    await studentRef.update({
      profilePhotoUrl: newProfilePhotoUrl,
      updatedAt: new Date().toISOString()
    });

    console.log(`✅ Updated profile photo URL for student ${studentUid}: ${newProfilePhotoUrl}`);

    return NextResponse.json({
      success: true,
      message: 'Profile photo URL updated successfully',
      studentUid: studentUid,
      newProfilePhotoUrl: newProfilePhotoUrl
    });

  } catch (error: any) {
    console.error('Error updating profile photo URL:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to update profile photo URL' },
      { status: 500 }
    );
  }
}


