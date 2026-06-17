import { NextRequest, NextResponse } from 'next/server';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getAdminServices() {
  const app = getApps()[0] ?? initializeApp({
    credential: cert({
      projectId: requireEnv('NEXT_PUBLIC_FIREBASE_PROJECT_ID'),
      clientEmail: requireEnv('FIREBASE_CLIENT_EMAIL'),
      privateKey: requireEnv('FIREBASE_PRIVATE_KEY').replace(/\\n/g, '\n'),
    }),
  });

  return {
    auth: getAuth(app),
    db: getFirestore(app),
  };
}

async function getAuthenticatedUserId(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) {
    return {
      response: NextResponse.json({ error: 'No authorization token provided' }, { status: 401 }),
    };
  }

  try {
    const { auth } = getAdminServices();
    const decodedToken = await auth.verifyIdToken(authHeader.slice('Bearer '.length));
    return { userId: decodedToken.uid };
  } catch {
    return {
      response: NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 }),
    };
  }
}

/**
 * POST /api/setup-admin-document
 *
 * Creates an admin document in Firestore for the currently authenticated user.
 */
export async function POST(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId(request);
    if (authResult.response) return authResult.response;

    const { db } = getAdminServices();
    const userId = authResult.userId;

    const adminDoc = await db.collection('admins').doc(userId).get();
    if (adminDoc.exists) {
      return NextResponse.json({
        success: true,
        message: 'Admin document already exists',
        adminId: userId,
        data: adminDoc.data(),
      });
    }

    const userDoc = await db.collection('users').doc(userId).get();
    if (!userDoc.exists) {
      return NextResponse.json({
        error: 'User document not found in users collection. Please ensure the user is registered.',
        userId,
      }, { status: 404 });
    }

    const userData = userDoc.data();
    if (userData?.role !== 'admin') {
      return NextResponse.json({
        error: `User role is "${userData?.role}", not "admin". Only admin users can have admin documents.`,
        userId,
      }, { status: 403 });
    }

    const adminData = {
      email: userData.email,
      name: userData.name,
      fullName: userData.name,
      role: userData.role,
      uid: userId,
      employeeId: 'ADM001',
      createdAt: userData.createdAt || FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await db.collection('admins').doc(userId).set(adminData);

    try {
      const { initializeBusFee } = await import('@/lib/bus-fee-service');
      await initializeBusFee();
    } catch {
      console.warn('Failed to initialize bus fee for admin.');
    }

    return NextResponse.json({
      success: true,
      message: 'Admin document created successfully from users collection data',
      adminId: userId,
      data: adminData,
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Failed to create admin document',
        details: 'Internal error',
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/setup-admin-document
 *
 * Checks if the current user has an admin document.
 */
export async function GET(request: NextRequest) {
  try {
    const authResult = await getAuthenticatedUserId(request);
    if (authResult.response) return authResult.response;

    const { db } = getAdminServices();
    const userId = authResult.userId;
    const adminDoc = await db.collection('admins').doc(userId).get();

    if (adminDoc.exists) {
      return NextResponse.json({
        exists: true,
        adminId: userId,
        data: adminDoc.data(),
      });
    }

    return NextResponse.json({
      exists: false,
      adminId: userId,
      message: 'No admin document found. Call POST to create one.',
    });
  } catch {
    return NextResponse.json(
      {
        error: 'Failed to check admin document',
        details: 'Internal error',
      },
      { status: 500 }
    );
  }
}
