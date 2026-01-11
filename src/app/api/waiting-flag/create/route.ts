/**
 * POST /api/waiting-flag/create
 * 
 * Create a waiting flag for student with:
 * - Duplicate prevention
 * - Rate limiting
 * - GPS validation
 * - Real-time broadcast to driver
 */

import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Rate limiting cache (in-memory for now, use Redis in production)
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

/**
 * Check rate limit for user
 */
function checkRateLimit(uid: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now();
  const entry = rateLimitCache.get(uid);

  if (!entry || entry.resetAt < now) {
    // Create new window
    rateLimitCache.set(uid, {
      count: 1,
      resetAt: now + windowMs
    });
    return true;
  }

  if (entry.count >= maxRequests) {
    return false; // Rate limit exceeded
  }

  // Increment count
  entry.count++;
  return true;
}

/**
 * Validate GPS coordinates
 */
function validateCoordinates(accuracy: number): boolean {
  // Check valid accuracy range
  if (accuracy < 0 || accuracy > 1000) {
    return false;
  }
  return true;
}

export async function POST(request: Request) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const {
      idToken,
      stopName,
      accuracy,
      message,
      busId,
      routeId
    } = body;

    // Validate required fields
    if (!idToken || !accuracy || !busId || !routeId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Validate coordinates
    if (!validateCoordinates(accuracy)) {
      return NextResponse.json(
        { error: 'Invalid GPS accuracy' },
        { status: 400 }
      );
    }

    // Verify Firebase token
    const decodedToken = await auth.verifyIdToken(idToken);
    const studentUid = decodedToken.uid;

    // Check rate limit
    if (!checkRateLimit(studentUid, 5, 60000)) { // 5 flags per minute
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before creating another flag.' },
        { status: 429 }
      );
    }

    // Verify user is a student
    const userDoc = await adminDb.collection('users').doc(studentUid).get();
    if (!userDoc.exists || userDoc.data()?.role !== 'student') {
      return NextResponse.json(
        { error: 'User is not authorized as a student' },
        { status: 403 }
      );
    }

    // Get student details
    const studentDoc = await adminDb.collection('students').doc(studentUid).get();
    if (!studentDoc.exists) {
      return NextResponse.json(
        { error: 'Student profile not found' },
        { status: 404 }
      );
    }

    const studentData = studentDoc.data();
    const studentName = studentData?.fullName || studentData?.name || 'Student';

    // Verify student is assigned to this bus
    if (studentData?.assignedBusId !== busId && studentData?.busId !== busId) {
      return NextResponse.json(
        { error: 'Student is not assigned to this bus' },
        { status: 403 }
      );
    }

    // Check if trip is active
    const tripQuery = await adminDb
      .collection('trip_sessions')
      .where('busId', '==', busId)
      .where('tripStatus', '==', 'active')
      .limit(1)
      .get();

    if (tripQuery.empty) {
      return NextResponse.json(
        { error: 'No active trip for this bus' },
        { status: 400 }
      );
    }

    const tripId = tripQuery.docs[0].id;

    // Check for duplicate flag
    const { data: existingFlags, error: checkError } = await supabase
      .from('waiting_flags')
      .select('id, status')
      .eq('student_uid', studentUid)
      .eq('bus_id', busId)
      .in('status', ['raised', 'acknowledged']);

    if (checkError) {
      console.error('❌ Error checking existing flags:', checkError);
    }

    if (existingFlags && existingFlags.length > 0) {
      return NextResponse.json(
        {
          error: 'You already have an active waiting flag',
          existingFlagId: existingFlags[0].id
        },
        { status: 409 }
      );
    }

    // Create waiting flag
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 15 * 60000); // 15 minutes

    const flagData = {
      student_uid: studentUid,
      student_name: studentName,
      bus_id: busId,
      route_id: routeId,
      stop_name: stopName || 'Current Location',
      accuracy: accuracy,
      status: 'raised',
      message: message || null,
      trip_id: tripId,
      created_at: now.toISOString(),
      expires_at: expiresAt.toISOString()
    };

    const { data: flag, error: insertError } = await supabase
      .from('waiting_flags')
      .insert(flagData)
      .select()
      .single();

    if (insertError) {
      console.error('❌ Error creating waiting flag:', insertError);
      return NextResponse.json(
        { error: 'Failed to create waiting flag' },
        { status: 500 }
      );
    }

    // Broadcast to driver via channel
    const driverChannel = supabase.channel(`waiting_flags_${busId}`);
    await driverChannel.send({
      type: 'broadcast',
      event: 'waiting_flag_created',
      payload: {
        flagId: flag.id,
        studentUid,
        studentName,
        stopName: stopName || 'Current Location',
        accuracy: accuracy,
        message,
        timestamp: now.toISOString()
      }
    });

    // Also store in Firestore for backup/persistence
    await adminDb.collection('waiting_flags').doc(flag.id).set({
      ...flagData,
      supabaseId: flag.id
    });

    // Log operation (audit_logs moved to Supabase - this is operational logging)
    console.log('📝 Waiting flag created:', {
      actorUid: studentUid,
      action: 'waiting_flag_created',
      flagId: flag.id,
      busId,
      routeId,
      tripId,
      accuracy: accuracy,
      timestamp: now.toISOString()
    });

    const elapsed = Date.now() - startTime;
    console.log(`✅ Waiting flag created in ${elapsed}ms: ${flag.id}`);

    return NextResponse.json({
      success: true,
      flagId: flag.id,
      message: 'Waiting flag created successfully',
      expiresAt: expiresAt.toISOString()
    });

  } catch (error: any) {
    console.error('❌ Error in waiting-flag/create:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
