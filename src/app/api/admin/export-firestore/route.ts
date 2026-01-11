import { NextRequest, NextResponse } from 'next/server';
import admin from 'firebase-admin';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || 'bus-tracker-40e1d',
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
        }),
    });
}

const db = admin.firestore();

// Collections to export
const COLLECTIONS_TO_EXPORT = [
    'users',
    'students',
    'drivers',
    'buses',
    'routes',
    'moderators',
    'applications',
    'notifications',
    'payments',
    'config',
    'systemConfig',
    'systemSignals',
    'admins'
];

/**
 * Convert Firestore Timestamps to serializable format
 */
function convertTimestamps(obj: any): any {
    if (obj === null || obj === undefined) return obj;

    // Handle Firestore Timestamp
    if (obj.toDate && typeof obj.toDate === 'function') {
        return { _type: 'timestamp', value: obj.toDate().toISOString() };
    }

    // Handle Admin SDK Timestamp
    if (obj._seconds !== undefined && obj._nanoseconds !== undefined) {
        return { _type: 'timestamp', value: new Date(obj._seconds * 1000).toISOString() };
    }

    if (Array.isArray(obj)) {
        return obj.map(item => convertTimestamps(item));
    }

    if (typeof obj === 'object') {
        const converted: any = {};
        for (const key in obj) {
            converted[key] = convertTimestamps(obj[key]);
        }
        return converted;
    }

    return obj;
}

/**
 * GET /api/admin/export-firestore
 * 
 * Exports all Firestore collections to JSON for backup
 * Requires admin authentication
 */
export async function GET(request: NextRequest) {
    try {
        // Verify admin authentication
        const authHeader = request.headers.get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { error: 'No authorization token provided' },
                { status: 401 }
            );
        }

        const idToken = authHeader.split('Bearer ')[1];

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

        // Verify the user is an admin
        const userDoc = await db.collection('users').doc(decodedToken.uid).get();
        const userData = userDoc.data();

        if (!userData || userData.role !== 'admin') {
            return NextResponse.json(
                { error: 'Only admins can export Firestore data' },
                { status: 403 }
            );
        }

        console.log(`📦 Firestore export requested by admin: ${userData.email}`);

        // Export all collections
        const exportData: any = {
            metadata: {
                exportedAt: new Date().toISOString(),
                exportedBy: userData.email,
                firebase: {
                    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
                },
                version: '1.0.0'
            },
            collections: {}
        };

        let totalDocuments = 0;

        for (const collectionName of COLLECTIONS_TO_EXPORT) {
            try {
                const snapshot = await db.collection(collectionName).get();
                const documents: any = {};

                snapshot.forEach(doc => {
                    documents[doc.id] = convertTimestamps(doc.data());
                });

                exportData.collections[collectionName] = {
                    documents,
                    count: snapshot.size
                };

                totalDocuments += snapshot.size;
                console.log(`   ✅ Exported ${snapshot.size} docs from ${collectionName}`);
            } catch (error: any) {
                console.error(`   ❌ Error exporting ${collectionName}:`, error.message);
                exportData.collections[collectionName] = {
                    documents: {},
                    count: 0,
                    error: error.message
                };
            }
        }

        console.log(`📊 Total documents exported: ${totalDocuments}`);

        // Return JSON as downloadable file
        const jsonString = JSON.stringify(exportData, null, 2);

        return new NextResponse(jsonString, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                'Content-Disposition': `attachment; filename="firestore_data_${new Date().toISOString().split('T')[0]}.json"`,
            },
        });

    } catch (error: any) {
        console.error('Error exporting Firestore data:', error);
        return NextResponse.json(
            {
                error: 'Failed to export Firestore data',
                details: error.message
            },
            { status: 500 }
        );
    }
}
