import { MetadataRoute } from 'next';
import { getSystemConfig } from '@/lib/system-config-service';

export default async function manifest(): Promise<MetadataRoute.Manifest> {
    let appName = 'AdtU Bus Services';
    let shortName = 'AdtU Bus';

    try {
        const config = await getSystemConfig();
        if (config?.appName) {
            appName = config.appName;
            shortName = config.appName;
        }
    } catch (e) {
        console.error('Error reading system config for manifest:', e);
    }

    return {
        name: `${appName} - Live Tracking`,
        short_name: shortName,
        description: `Real-time bus tracking for ${shortName} students and drivers`,
        start_url: '/',
        display: 'standalone',
        background_color: '#ffffff',
        theme_color: '#3B82F6',
        orientation: 'portrait-primary',
        icons: [
            {
                src: '/icons/icon-512x512.png',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable' as any
            },
            {
                src: '/icons/icon-192x192.png',
                sizes: '192x192',
                type: 'image/png',
                purpose: 'any maskable' as any
            }
        ],
        categories: ['education', 'transportation', 'utilities'],
        shortcuts: [
            {
                name: 'Track Bus',
                short_name: 'Track',
                description: 'Track your bus in real-time',
                url: '/student/track-bus',
                icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }]
            },
            {
                name: 'Live Tracking',
                short_name: 'Live',
                description: 'Driver live tracking',
                url: '/driver/live-tracking',
                icons: [{ src: '/icons/icon-192x192.png', sizes: '192x192' }]
            }
        ],
        prefer_related_applications: false,
    }
}
