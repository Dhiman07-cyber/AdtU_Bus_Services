import { MetadataRoute } from 'next';
import fs from 'fs';
import path from 'path';

export default function manifest(): MetadataRoute.Manifest {
    let appName = 'AdtU Bus Services';
    let shortName = 'AdtU Bus';

    try {
        const configPath = path.join(process.cwd(), 'src', 'config', 'system_config.json');
        if (fs.existsSync(configPath)) {
            const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
            if (config.appName) {
                appName = config.appName;
                shortName = config.appName;
            }
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
                src: '/manifest-icon',
                sizes: '512x512',
                type: 'image/png',
                purpose: 'any maskable' as any
            },
            {
                src: '/manifest-icon', // Use same dynamic icon for 192 as well, browser resizes or we can add size param
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
                icons: [{ src: '/manifest-icon', sizes: '192x192' }]
            },
            {
                name: 'Live Tracking',
                short_name: 'Live',
                description: 'Driver live tracking',
                url: '/driver/live-tracking',
                icons: [{ src: '/manifest-icon', sizes: '192x192' }]
            }
        ],
        prefer_related_applications: false,
    }
}
