import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

// Supabase storage configuration
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const BUCKET_NAME = 'adtu_bus_assets';
const DEFAULT_VIDEO_PATH = 'landing_video/Welcome_Final.mp4';

/**
 * GET /api/landing-video
 * Returns the public URL for the landing page video from Supabase Storage
 */
export async function GET() {
    try {
        if (!SUPABASE_URL) {
            console.error('Supabase URL not configured');
            return NextResponse.json(
                { error: 'Storage not configured' },
                { status: 500 }
            );
        }

        // Fetch dynamic path from Firestore
        let videoPath = DEFAULT_VIDEO_PATH;
        try {
            const configDoc = await adminDb.collection('settings').doc('landing').get();
            if (configDoc.exists) {
                const config = configDoc.data();
                if (config && config.videoPath) {
                    videoPath = config.videoPath;
                }
            }
        } catch (e) {
            console.warn('Could not fetch landing config, using default video path:', e);
        }

        // Construct the public URL for the video
        const videoUrl = `${SUPABASE_URL}/storage/v1/object/public/${BUCKET_NAME}/${videoPath}`;

        return NextResponse.json({
            success: true,
            url: videoUrl
        });
    } catch (error) {
        console.error('Error getting landing video URL:', error);
        return NextResponse.json(
            { error: 'Failed to get video URL' },
            { status: 500 }
        );
    }
}
