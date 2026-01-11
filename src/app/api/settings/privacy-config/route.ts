import { headers } from 'next/headers';
import fs from 'fs';
import path from 'path';

// Get the path to the config file
const configPath = path.join(process.cwd(), 'src', 'config', 'privacy_config.json');

// Ensure the directory exists
const ensureDirectoryExists = () => {
    const dir = path.dirname(configPath);
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
};

export async function GET() {
    try {
        if (fs.existsSync(configPath)) {
            let fileContent = fs.readFileSync(configPath, 'utf-8');

            // Inject App Name from system_config.json
            try {
                const systemConfigPath = path.join(process.cwd(), 'src', 'config', 'system_config.json');
                if (fs.existsSync(systemConfigPath)) {
                    const systemConfig = JSON.parse(fs.readFileSync(systemConfigPath, 'utf-8'));
                    if (systemConfig.appName) {
                        fileContent = fileContent.replace(/AdtU Bus Services/g, systemConfig.appName);
                    }
                }
            } catch (e) {
                console.error('Error injecting app name into privacy config:', e);
            }

            return new Response(JSON.stringify({ success: true, config: JSON.parse(fileContent) }), {
                headers: { 'Content-Type': 'application/json' },
            });
        } else {
            // Return default/empty structure if file doesn't exist
            return new Response(JSON.stringify({
                success: true,
                config: {
                    title: "Privacy Policy",
                    lastUpdated: new Date().toISOString().split('T')[0],
                    sections: []
                }
            }), {
                headers: { 'Content-Type': 'application/json' },
            });
        }
    } catch (error: any) {
        console.error('Error reading privacy config:', error);
        return new Response(JSON.stringify({ success: false, error: 'Failed to read configuration' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}

export async function POST(request: Request) {
    try {
        const authHeader = (await headers()).get('authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(JSON.stringify({ success: false, error: 'Unauthorized' }), {
                status: 401,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        const body = await request.json();
        const { config } = body;

        if (!config) {
            return new Response(JSON.stringify({ success: false, error: 'Invalid configuration data' }), {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        ensureDirectoryExists();

        // Update lastUpdated date automatically
        config.lastUpdated = new Date().toISOString().split('T')[0];

        fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf-8');

        return new Response(JSON.stringify({ success: true, message: 'Configuration saved successfully', config }), {
            headers: { 'Content-Type': 'application/json' },
        });
    } catch (error: any) {
        console.error('Error saving privacy config:', error);
        return new Response(JSON.stringify({ success: false, error: 'Failed to save configuration' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }
}
