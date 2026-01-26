import { ImageResponse } from 'next/og';
import { join } from 'path';
import { readFileSync, existsSync } from 'fs';

export const runtime = 'nodejs';

export async function GET() {
    let appName = 'AdtU Bus Services';

    try {
        const configPath = join(process.cwd(), 'src', 'config', 'system_config.json');
        if (existsSync(configPath)) {
            const config = JSON.parse(readFileSync(configPath, 'utf-8'));
            if (config.appName) {
                appName = config.appName;
            }
        }
    } catch (e) {
        console.error('Error reading system config for manifest icon:', e);
    }

    const iconPath = join(process.cwd(), 'public', 'Bus_Icon.png');
    const fallbackPath = join(process.cwd(), 'public', 'icons', 'icon-512x512.png');

    let iconBuffer: Buffer | null = null;

    if (existsSync(iconPath)) {
        iconBuffer = readFileSync(iconPath);
    } else if (existsSync(fallbackPath)) {
        iconBuffer = readFileSync(fallbackPath);
    }

    if (!iconBuffer) {
        return new Response('Icon source not found', { status: 404 });
    }

    const iconBase64 = `data:image/png;base64,${iconBuffer.toString('base64')}`;

    return new ImageResponse(
        (
            <div
                style={{
                    width: '100%',
                    height: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: '#ffffff',
                    position: 'relative',
                }}
            >
                {/* Safe Area Container - roughly 80% to ensure no cropping in circle masks */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        width: '70%',
                        height: '70%',
                    }}
                >
                    <img
                        src={iconBase64}
                        style={{
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                        }}
                    />
                </div>
            </div>
        ),
        {
            width: 512,
            height: 512,
        }
    );
}
