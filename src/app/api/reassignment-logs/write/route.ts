/**
 * POST /api/reassignment-logs/write
 * 
 * Simple endpoint to write reassignment logs to Supabase.
 * Uses the same pattern as the working student reassignment API.
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { adminAuth, adminDb } from '@/lib/firebase-admin';

export async function POST(request: NextRequest) {
    console.log('[reassignment-logs/write] ========== START ==========');
    
    try {
        // 1. Verify authentication
        const authHeader = request.headers.get('Authorization');
        if (!authHeader?.startsWith('Bearer ')) {
            console.error('[reassignment-logs/write] No auth header');
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const token = authHeader.substring(7);
        const decodedToken = await adminAuth.verifyIdToken(token);
        const uid = decodedToken.uid;
        console.log('[reassignment-logs/write] User verified:', uid);

        // 2. Check admin/moderator
        const [adminDoc, moderatorDoc] = await Promise.all([
            adminDb.collection('admins').doc(uid).get(),
            adminDb.collection('moderators').doc(uid).get(),
        ]);

        if (!adminDoc.exists && !moderatorDoc.exists) {
            console.error('[reassignment-logs/write] User is not admin/moderator');
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
        console.log('[reassignment-logs/write] Admin/Moderator verified');

        // 3. Parse request body
        const body = await request.json();
        const { operationId, type, actorId, actorLabel, status, summary, changes, meta } = body;
        console.log('[reassignment-logs/write] Payload:', { operationId, type, status });

        if (!operationId || !type || !actorId || !actorLabel || !status) {
            return NextResponse.json({ 
                error: 'Missing required fields',
                required: ['operationId', 'type', 'actorId', 'actorLabel', 'status']
            }, { status: 400 });
        }

        // 4. Create Supabase client
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        
        console.log('[reassignment-logs/write] Supabase URL:', supabaseUrl ? 'SET' : 'MISSING');
        console.log('[reassignment-logs/write] Supabase Key:', supabaseKey ? `SET (${supabaseKey.length} chars)` : 'MISSING');

        if (!supabaseUrl || !supabaseKey) {
            return NextResponse.json({ 
                error: 'Server configuration error',
                details: 'Missing Supabase credentials'
            }, { status: 500 });
        }

        const supabase = createClient(supabaseUrl, supabaseKey, {
            auth: { persistSession: false }
        });

        // 5. Delete old logs of same type (keep only ONE per type)
        if (type !== 'rollback') {
            console.log(`[reassignment-logs/write] Deleting old ${type} logs...`);
            const { error: deleteError } = await supabase
                .from('reassignment_logs')
                .delete()
                .eq('type', type);

            if (deleteError) {
                console.warn('[reassignment-logs/write] Delete warning:', deleteError.message);
            } else {
                console.log('[reassignment-logs/write] Old logs deleted');
            }
        }

        // 6. Insert new log
        console.log('[reassignment-logs/write] Inserting new log...');
        const { data, error } = await supabase
            .from('reassignment_logs')
            .insert([{
                operation_id: operationId,
                type,
                actor_id: actorId,
                actor_label: actorLabel,
                status,
                summary: summary || null,
                changes: changes || [],
                meta: meta || {},
                rollback_of: body.rollbackOf || null,
            }])
            .select()
            .single();

        if (error) {
            console.error('[reassignment-logs/write] Insert error:', error);
            return NextResponse.json({ 
                error: error.message,
                code: error.code,
                details: error.details,
                hint: error.hint
            }, { status: 500 });
        }

        console.log('[reassignment-logs/write] ✅ SUCCESS! ID:', data?.id);
        console.log('[reassignment-logs/write] ========== END ==========');

        return NextResponse.json({
            success: true,
            data: { id: data?.id, operation_id: operationId }
        });

    } catch (err: any) {
        console.error('[reassignment-logs/write] Exception:', err);
        return NextResponse.json({ 
            error: err.message,
            stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
        }, { status: 500 });
    }
}
