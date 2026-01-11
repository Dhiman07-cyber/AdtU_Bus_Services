import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  // Use environment variables instead of service account JSON file
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'bus-tracker-40e1d',
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    }),
  });
}

const db = admin.firestore();

/**
 * POST /api/setup-admin-document
 * 
 * Creates an admin document in Firestore for the currently authenticated user
 * This fixes the 403 error on the feedback page
 */
export async function POST(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No authorization token provided' },
        { status: 401 }
      );
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Check if admin document already exists
    const adminDoc = await db.collection('admins').doc(userId).get();
    
    if (adminDoc.exists) {
      return NextResponse.json({
        success: true,
        message: 'Admin document already exists',
        adminId: userId,
        data: adminDoc.data()
      });
    }

    // Fetch user data from users collection
    const userDoc = await db.collection('users').doc(userId).get();
    
    if (!userDoc.exists) {
      return NextResponse.json({
        error: 'User document not found in users collection. Please ensure the user is registered.',
        userId: userId
      }, { status: 404 });
    }

    const userData = userDoc.data();
    
    // Verify the user is an admin
    if (userData?.role !== 'admin') {
      return NextResponse.json({
        error: `User role is "${userData?.role}", not "admin". Only admin users can have admin documents.`,
        userId: userId
      }, { status: 403 });
    }

    // Create admin document using data from users collection
    const adminData = {
      email: userData.email,
      name: userData.name,
      fullName: userData.name, // Using name as fullName for consistency
      role: userData.role,
      uid: userId,
      employeeId: 'ADM001',
      createdAt: userData.createdAt || admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await db.collection('admins').doc(userId).set(adminData);

    // Initialize bus fee for this admin
    try {
      const { initializeAdminBusFee } = await import('@/lib/bus-fee-service');
      await initializeAdminBusFee(userId);
    } catch (error) {
      console.warn('Failed to initialize bus fee for admin (non-critical):', error);
    }

    console.log(`✅ Admin document created for ${userData.email} (${userId})`);

    return NextResponse.json({
      success: true,
      message: 'Admin document created successfully from users collection data',
      adminId: userId,
      data: adminData
    });

  } catch (error: any) {
    console.error('Error creating admin document:', error);
    return NextResponse.json(
      { 
        error: 'Failed to create admin document',
        details: error.message 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/setup-admin-document
 * 
 * Checks if the current user has an admin document
 */
export async function GET(request: NextRequest) {
  try {
    // Get the authorization header
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json(
        { error: 'No authorization token provided' },
        { status: 401 }
      );
    }

    const idToken = authHeader.split('Bearer ')[1];

    // Verify the ID token
    let decodedToken;
    try {
      decodedToken = await admin.auth().verifyIdToken(idToken);
    } catch (error) {
      console.error('Error verifying token:', error);
      return NextResponse.json(
        { error: 'Invalid or expired token' },
        { status: 401 }
      );
    }

    const userId = decodedToken.uid;

    // Check if admin document exists
    const adminDoc = await db.collection('admins').doc(userId).get();
    
    if (adminDoc.exists) {
      return NextResponse.json({
        exists: true,
        adminId: userId,
        data: adminDoc.data()
      });
    }

    return NextResponse.json({
      exists: false,
      adminId: userId,
      message: 'No admin document found. Call POST to create one.'
    });

  } catch (error: any) {
    console.error('Error checking admin document:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check admin document',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
