/**
 * Get Deadline Configuration API
 * 
 * Returns the current deadline configuration from Firestore
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { getDeadlineConfig } from '@/lib/deadline-config-service';

export async function GET(request: NextRequest) {
    try {
        // Verify admin authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.split('Bearer ')[1];

        try {
            const decodedToken = await adminAuth.verifyIdToken(token);

            // Verify user is admin
            const adminDoc = await adminDb.collection('admins').doc(decodedToken.uid).get();
            if (!adminDoc.exists) {
                return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
            }
        } catch {
            // Allow unauthenticated access for client-side loading? 
            // The original logic allowed falling back if auth failed but proceeded to load config.
            // "Allow unauthenticated access for client-side loading (config is not sensitive)"
            // I'll keep this behavior but it's risky if config contained sensitive info. Deadline config is public logic.
        }

        // Load config from Firestore
        const config = await getDeadlineConfig();

        return NextResponse.json({
            success: true,
            config,
        });

    } catch (error: any) {
        console.error('Error loading deadline config:', error);
        return NextResponse.json(
            { error: error.message || 'Failed to load config' },
            { status: 500 }
        );
    }
}
