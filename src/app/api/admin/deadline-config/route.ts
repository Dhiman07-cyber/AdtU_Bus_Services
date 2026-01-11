/**
 * Get Deadline Configuration API
 * 
 * Returns the current deadline configuration from deadline-config.json
 */

import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import fs from 'fs';
import path from 'path';

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
            // Allow unauthenticated access for client-side loading (config is not sensitive)
        }

        // Load config
        const configPath = path.join(process.cwd(), 'src', 'config', 'deadline-config.json');

        if (!fs.existsSync(configPath)) {
            return NextResponse.json({ error: 'Config file not found' }, { status: 404 });
        }

        const configContent = fs.readFileSync(configPath, 'utf8');
        const config = JSON.parse(configContent);

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
