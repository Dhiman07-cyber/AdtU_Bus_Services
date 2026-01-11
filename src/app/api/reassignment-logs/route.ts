/**
 * Reassignment Logs API Route
 * 
 * GET /api/reassignment-logs - Query reassignment logs from Supabase
 * POST /api/reassignment-logs - Create new log entry
 * 
 * Query params:
 *   - type: 'driver_reassignment' | 'student_reassignment' | 'route_reassignment' | 'rollback'
 *   - status: 'pending' | 'committed' | 'rolled_back' | 'failed' | 'no-op'
 *   - limit: number (default 10)
 *   - offset: number (default 0)
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminDb, adminAuth } from '@/lib/firebase-admin';

/**
 * Verify admin/moderator session
 */
async function verifyAdminOrModerator(request: NextRequest): Promise<{ uid: string; role: string; name: string } | null> {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) {
        return null;
    }

    try {
        const token = authHeader.substring(7);
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;

        // Check if user is admin or moderator
        const [adminDoc, moderatorDoc] = await Promise.all([
            adminDb.collection('admins').doc(uid).get(),
            adminDb.collection('moderators').doc(uid).get(),
        ]);

        if (adminDoc.exists) {
            const data = adminDoc.data();
            return { uid, role: 'Admin', name: data?.name || 'Admin' };
        }

        if (moderatorDoc.exists) {
            const data = moderatorDoc.data();
            return { uid, role: 'Moderator', name: data?.name || 'Moderator' };
        }

        return null;
    } catch (error) {
        console.error('[reassignment-logs] Auth error:', error);
        return null;
    }
}

export async function GET(request: NextRequest) {
    try {
        // Verify admin/moderator session
        const session = await verifyAdminOrModerator(request);
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Create Supabase client inline
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });

        // Parse query params
        const { searchParams } = new URL(request.url);
        const type = searchParams.get('type');
        const status = searchParams.get('status');
        const limit = parseInt(searchParams.get('limit') || '10');
        const offset = parseInt(searchParams.get('offset') || '0');

        // Build query
        let query = supabase
            .from('reassignment_logs')
            .select('*', { count: 'exact' })
            .order('created_at', { ascending: false });

        if (type) {
            query = query.eq('type', type);
        }
        if (status) {
            query = query.eq('status', status);
        }

        query = query.range(offset, offset + limit - 1);

        const { data, error, count } = await query;

        if (error) {
            console.error('[reassignment-logs GET] Query error:', error);
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({
            success: true,
            data: data || [],
            pagination: {
                total: count || 0,
                limit,
                offset,
                hasMore: (count || 0) > offset + limit,
            },
        });

    } catch (err: any) {
        console.error('[reassignment-logs GET] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    console.log('[reassignment-logs POST] Starting...');
    
    try {
        // Create Supabase client inline
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        console.log('[reassignment-logs POST] Supabase URL:', supabaseUrl ? 'SET' : 'MISSING');
        console.log('[reassignment-logs POST] Supabase Key:', supabaseKey ? `SET (${supabaseKey.length} chars)` : 'MISSING');
        
        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ 
                error: 'Server configuration error: Missing Supabase credentials'
            }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });

        // Verify admin/moderator session
        const session = await verifyAdminOrModerator(request);
        if (!session) {
            console.error('[reassignment-logs POST] Unauthorized');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        console.log('[reassignment-logs POST] Session verified:', session.uid);

        const body = await request.json();
        const { operationId, type, actorId, actorLabel, status, changes } = body;

        if (!operationId || !type || !actorId || !actorLabel || !status) {
            return NextResponse.json(
                { error: 'Missing required fields' },
                { status: 400 }
            );
        }

        // Delete old logs of the same type first (keep only ONE per type)
        if (type !== 'rollback') {
            console.log(`[reassignment-logs POST] Deleting old ${type} logs...`);
            await supabase
                .from('reassignment_logs')
                .delete()
                .eq('type', type);
        }

        // Insert new log
        console.log('[reassignment-logs POST] Inserting new log...');
        const { data, error } = await supabase
            .from('reassignment_logs')
            .insert([{
                operation_id: operationId,
                type,
                actor_id: actorId,
                actor_label: actorLabel,
                status,
                summary: body.summary || null,
                changes: changes || [],
                meta: body.meta || {},
                rollback_of: body.rollbackOf || null,
            }])
            .select()
            .single();

        if (error) {
            console.error('[reassignment-logs POST] Insert error:', error);
            return NextResponse.json({ 
                error: error.message,
                code: error.code
            }, { status: 500 });
        }

        console.log(`[reassignment-logs POST] ✅ Success: ${operationId}`);
        return NextResponse.json({ success: true, data });

    } catch (err: any) {
        console.error('[reassignment-logs POST] Error:', err);
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
