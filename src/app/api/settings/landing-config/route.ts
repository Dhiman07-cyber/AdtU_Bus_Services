import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export const dynamic = 'force-dynamic';

const COLLECTION_NAME = 'settings';
const DOC_ID = 'landing';

const DEFAULT_CONFIG = {
    videoPath: 'landing_video/Welcome_Final.mp4',
    supportPhones: [
        '+91 93657 71454',
        '+91 91270 70577',
        '+91 60039 03319'
    ],
    email: 'support@adtu.in', // Example default
};

export async function GET(req: NextRequest) {
    try {
        let config = DEFAULT_CONFIG;

        if (adminDb) {
            const doc = await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).get();
            if (doc.exists) {
                const data = doc.data();
                config = { ...DEFAULT_CONFIG, ...data };
            }
        } else {
            console.warn('⚠️ Firebase Admin DB not initialized. Returning default landing config.');
        }

        return NextResponse.json({
            success: true,
            config
        });
    } catch (error: any) {
        console.error('Error fetching landing config:', error);
        return NextResponse.json({ success: false, error: 'Failed to fetch config' }, { status: 500 });
    }
}

export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);

        // Check admin role
        const userDoc = await adminAuth.getUser(decodedToken.uid);
        if (userDoc.customClaims?.role !== 'admin') {
            return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
        }

        const body = await req.json();
        const { config } = body;

        if (!config) {
            return NextResponse.json({ success: false, error: 'Invalid data' }, { status: 400 });
        }

        await adminDb.collection(COLLECTION_NAME).doc(DOC_ID).set({
            ...config,
            lastUpdated: new Date().toISOString(),
        }, { merge: true });

        return NextResponse.json({ success: true, message: 'Config updated' });
    } catch (error: any) {
        console.error('Error updating landing config:', error);
        return NextResponse.json({ success: false, error: 'Failed to update config' }, { status: 500 });
    }
}
