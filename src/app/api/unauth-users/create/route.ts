import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

/**
 * Create or update an unauthenticated user entry
 * This is called when a new user signs in with Google but doesn't have a user doc yet
 */
export async function POST(request: NextRequest) {
  try {
    console.log('📥 UnauthUser create API called');
    console.log('📥 Request headers:', Object.fromEntries(request.headers.entries()));

    const token = request.headers.get('Authorization')?.replace('Bearer ', '');

    if (!token) {
      console.error('❌ No token provided');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let decodedToken;
    try {
      decodedToken = await adminAuth.verifyIdToken(token);
    } catch (tokenError: any) {
      console.error('❌ Token verification failed:', tokenError);
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    const uid = decodedToken.uid;
    const email = decodedToken.email;

    console.log('✅ Token verified for user:', uid, email);

    if (!email) {
      console.error('❌ No email in token');
      return NextResponse.json({ error: 'Email not found in token' }, { status: 400 });
    }

    // Check if adminDb is properly initialized
    if (!adminDb) {
      console.error('❌ Admin Firestore not initialized!');
      console.error('❌ Admin Auth available:', !!adminAuth);
      console.error('❌ Environment check:', {
        hasProjectId: !!process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
        hasClientEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
        hasPrivateKey: !!process.env.FIREBASE_PRIVATE_KEY
      });
      return NextResponse.json(
        { error: 'Firestore Admin SDK not initialized. Check environment variables.' },
        { status: 500 }
      );
    }

    // Check if user already exists in users collection
    console.log('🔍 Checking users collection for existing user:', uid);
    const userDoc = await adminDb.collection('users').doc(uid).get();

    if (userDoc.exists) {
      console.log('✅ User already exists in users collection');
      return NextResponse.json({
        success: false,
        message: 'User already exists in users collection',
        hasUserDoc: true
      });
    }

    // Check if user already exists in unauthUsers collection
    console.log('🔍 Checking unauthUsers collection for existing user:', uid);
    const unauthUserDoc = await adminDb.collection('unauthUsers').doc(uid).get();

    const now = new Date().toISOString();

    if (unauthUserDoc.exists) {
      console.log('✅ Updating existing unauthUser document');
      // Update lastLoginAt
      await adminDb.collection('unauthUsers').doc(uid).update({
        lastLoginAt: now
      });

      return NextResponse.json({
        success: true,
        message: 'Unauthenticated user record updated',
        isNewUser: false
      });
    }

    // Create new unauthUser document
    const unauthUserData = {
      uid,
      email,
      displayName: decodedToken.name || email.split('@')[0],
      photoURL: decodedToken.picture || null,
      createdAt: now,
      lastLoginAt: now,
      status: 'pending_application', // pending_application, application_submitted, approved, rejected
      needsApplication: true
    };

    console.log('💾 Creating new unauthUser document for:', uid);
    console.log('📄 Document data:', JSON.stringify(unauthUserData, null, 2));

    try {
      await adminDb.collection('unauthUsers').doc(uid).set(unauthUserData);
      console.log('✅ UnauthUser document created successfully');
    } catch (dbError: any) {
      console.error('❌ Firestore write error:', dbError);
      console.error('Error code:', dbError.code);
      console.error('Error message:', dbError.message);
      return NextResponse.json(
        { error: `Firestore write failed: ${dbError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Unauthenticated user created',
      isNewUser: true
    });
  } catch (error: any) {
    console.error('❌ Error creating unauthenticated user:', error);
    console.error('Error stack:', error.stack);
    return NextResponse.json(
      { error: error.message || 'Failed to create unauthenticated user' },
      { status: 500 }
    );
  }
}
