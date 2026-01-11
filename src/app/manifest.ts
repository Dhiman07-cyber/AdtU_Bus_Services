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
                const words = config.appName.split(' ');
                shortName = words.length > 1 ? words.slice(0, 2).join(' ') : config.appName;
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
                src: '/icons/icon-72x72.svg',
                sizes: '72x72',
                type: 'image/svg+xml',
                purpose: 'any maskable' as any
            },
            {
                src: '/icons/icon-192x192.svg',
                sizes: '192x192',
                type: 'image/svg+xml',
                purpose: 'any maskable' as any
            },
            {
                src: '/icons/icon-512x512.png',
                sizes: '512x512',
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
                icons: [{ src: '/icons/icon-192x192.svg', sizes: '192x192' }]
            },
            {
                name: 'Live Tracking',
                short_name: 'Live',
                description: 'Driver live tracking',
                url: '/driver/live-tracking',
                icons: [{ src: '/icons/icon-192x192.svg', sizes: '192x192' }]
            }
        ],
        prefer_related_applications: false,
    }
}
