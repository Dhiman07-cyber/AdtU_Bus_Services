import { NextRequest, NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase-admin';
import { NotificationService } from '@/lib/notifications/NotificationService';
import { NotificationTarget } from '@/lib/notifications/types';
import fs from 'fs';
import path from 'path';

const CONFIG_FILE_PATH = path.join(process.cwd(), 'src', 'config', 'system_config.json');

// GET: Retrieve system config from JSON file
export async function GET(req: NextRequest) {
    try {
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            const config = JSON.parse(fileContent);
            return NextResponse.json({ config });
        }

        return NextResponse.json(
            { message: 'Configuration file not found' },
            { status: 404 }
        );
    } catch (error) {
        console.error('Error fetching system config:', error);
        return NextResponse.json(
            { message: 'Failed to fetch system configuration' },
            { status: 500 }
        );
    }
}

// POST: Update system config (Admin only)
export async function POST(req: NextRequest) {
    try {
        const authHeader = req.headers.get('Authorization');
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return NextResponse.json(
                { message: 'Unauthorized' },
                { status: 401 }
            );
        }

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        // Check if user is admin
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (!userDoc.exists || userDoc.data()?.role !== 'admin') {
            return NextResponse.json(
                { message: 'Access denied. Admin only.' },
                { status: 403 }
            );
        }

        const { config } = await req.json();

        if (!config) {
            return NextResponse.json(
                { message: 'Invalid configuration data' },
                { status: 400 }
            );
        }

        // Read current config
        let oldConfig: any = {};
        if (fs.existsSync(CONFIG_FILE_PATH)) {
            const fileContent = fs.readFileSync(CONFIG_FILE_PATH, 'utf-8');
            try {
                oldConfig = JSON.parse(fileContent);
            } catch (e) {
                console.warn('Could not parse existing config file');
            }
        }

        // Prepare updated config
        const updatedConfig = {
            ...oldConfig,
            ...config,
            lastUpdated: new Date().toISOString(),
            updatedBy: uid
        };

        // Special handling for bus fee updates (history, notifications)
        if (config.busFee && config.busFee.amount !== oldConfig.busFee?.amount) {
            // Update metadata for bus fee
            updatedConfig.busFee = {
                ...updatedConfig.busFee,
                updatedAt: new Date().toISOString(),
                updatedBy: uid,
                version: (oldConfig.busFee?.version || 0) + 1,
                history: [
                    ...(oldConfig.busFee?.history || []),
                    {
                        amount: oldConfig.busFee?.amount || 0,
                        updatedAt: oldConfig.busFee?.updatedAt || new Date().toISOString(),
                        updatedBy: oldConfig.busFee?.updatedBy || 'system'
                    }
                ]
            };

            // Notify users about bus fee change
            try {
                const adminDoc = await adminDb.collection('admins').doc(uid).get();
                const adminData = adminDoc.exists ? adminDoc.data() : {};
                const adminName = adminData?.name || adminData?.fullName || 'Admin';

                const notificationService = new NotificationService();
                const target: NotificationTarget = { type: 'all_users' };

                const oldAmount = oldConfig.busFee?.amount || 0;
                const newAmount = config.busFee.amount;

                const notificationContent = `The bus fee for the upcoming session has been revised from ₹${oldAmount.toLocaleString('en-IN')} to ₹${newAmount.toLocaleString('en-IN')}. ` +
                    `Please update your payment plans accordingly. For any queries, contact the administration office.`;

                await notificationService.createNotification(
                    { userId: uid, userName: adminName, userRole: 'admin' },
                    target,
                    notificationContent,
                    '💰 Bus Fee Update - Important Notice',
                    { type: 'announcement' }
                );
            } catch (error) {
                console.error('Failed to send notification:', error);
            }
        }

        fs.writeFileSync(CONFIG_FILE_PATH, JSON.stringify(updatedConfig, null, 2), 'utf-8');

        return NextResponse.json({
            message: 'System configuration updated successfully',
            config: updatedConfig
        });

    } catch (error) {
        console.error('Error updating system config:', error);
        return NextResponse.json(
            { message: 'Failed to update system configuration' },
            { status: 500 }
        );
    }
}
