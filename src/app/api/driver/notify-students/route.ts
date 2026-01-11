import { NextResponse } from 'next/server';
import { auth, db as adminDb } from '@/lib/firebase-admin';
import { getMessaging } from 'firebase-admin/messaging';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { idToken, busId, routeId, tripId } = body;

    // Get token from either body or Authorization header
    let token = idToken;
    if (!token) {
      const authHeader = request.headers.get('authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7);
      }
    }

    if (!token || !busId || !routeId || !tripId) {
      return NextResponse.json(
        { error: 'Missing required fields: idToken, busId, routeId, tripId' },
        { status: 400 }
      );
    }

    if (!auth) {
      return NextResponse.json(
        { error: 'Firebase Admin not initialized' },
        { status: 500 }
      );
    }

    // Verify Firebase ID token
    const decodedToken = await auth.verifyIdToken(token);
    const driverUid = decodedToken.uid;

    // Get driver data
    const driverDoc = await adminDb.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    }

    const driverData = driverDoc.data();

    // Get all students assigned to this bus
    console.log('🔍 Looking for students assigned to bus:', busId);
    
    let studentsSnapshot = await adminDb
      .collection('students')
      .where('assignedBusId', '==', busId)
      .get();

    console.log(`📊 Found ${studentsSnapshot.size} students for bus ${busId}`);

    console.log(`📊 Found ${studentsSnapshot.size} students for bus ${busId}`);

    if (studentsSnapshot.empty) {
      // Try alternative field names
      console.log('🔍 Trying alternative field names...');
      
      const altSnapshot1 = await adminDb
        .collection('students')
        .where('busId', '==', busId)
        .get();
      
      const altSnapshot2 = await adminDb
        .collection('students')
        .where('bus_id', '==', busId)
        .get();

      console.log(`📊 Alternative searches: busId=${altSnapshot1.size}, bus_id=${altSnapshot2.size}`);

      if (altSnapshot1.empty && altSnapshot2.empty) {
        return NextResponse.json({ 
          success: true, 
          message: 'No students found for this bus',
          notifiedCount: 0,
          debug: {
            searchedFields: ['assignedBusId', 'busId', 'bus_id'],
            busId: busId
          }
        });
      }
      
      // Use the first non-empty result
      const finalSnapshot = altSnapshot1.empty ? altSnapshot2 : altSnapshot1;
      console.log(`✅ Using alternative field, found ${finalSnapshot.size} students`);
      
      // Process the alternative snapshot
      const fcmTokens: string[] = [];
      const studentPromises = finalSnapshot.docs.map(async (studentDoc: any) => {
        const studentData = studentDoc.data();
        console.log('👤 Student data:', { id: studentDoc.id, fcmToken: !!studentData.fcmToken });
        if (studentData.fcmToken) {
          fcmTokens.push(studentData.fcmToken);
        }
      });

      await Promise.all(studentPromises);
      
      if (fcmTokens.length === 0) {
        return NextResponse.json({ 
          success: true, 
          message: 'Students found but no FCM tokens available',
          notifiedCount: 0,
          debug: {
            studentsFound: finalSnapshot.size,
            fcmTokensFound: 0
          }
        });
      }

      // Send notifications with alternative data
      const routeDoc = await adminDb.collection('routes').doc(routeId).get();
      const routeData = routeDoc.exists ? routeDoc.data() : null;
      const routeName = routeData?.name || 'your route';

      const notification = {
        title: '🚌 Bus Journey Started!',
        body: `Your bus for ${routeName} has started its journey. Track it live now!`,
        data: {
          type: 'TRIP_STARTED',
          busId: busId,
          routeId: routeId,
          tripId: tripId,
          driverName: driverData?.fullName || 'Driver',
          routeName: routeName
        }
      };

      const messaging = getMessaging();
      const message = {
        notification: notification,
        data: notification.data,
        tokens: fcmTokens,
        android: {
          notification: {
            icon: 'bus_icon',
            color: '#4CAF50',
            sound: 'default',
            priority: 'high' as const,
            channelId: 'bus_notifications'
          }
        },
        apns: {
          payload: {
            aps: {
              alert: notification,
              sound: 'default',
              badge: 1
            }
          }
        }
      };

      try {
        const response = await messaging.sendEachForMulticast(message);
        console.log(`✅ FCM notifications sent: ${response.successCount} successful, ${response.failureCount} failed`);
        
        return NextResponse.json({
          success: true,
          message: 'Students notified successfully',
          notifiedCount: response.successCount,
          failedCount: response.failureCount,
          totalStudents: fcmTokens.length,
          debug: {
            usedAlternativeField: true,
            studentsFound: finalSnapshot.size
          }
        });
      } catch (fcmError: any) {
        console.error('❌ FCM Error:', fcmError);
        return NextResponse.json({
          success: false,
          error: 'Failed to send notifications',
          details: fcmError.message
        }, { status: 500 });
      }
    }

    // Get route data for notification message
    const routeDoc = await adminDb.collection('routes').doc(routeId).get();
    const routeData = routeDoc.exists ? routeDoc.data() : null;
    const routeName = routeData?.name || 'your route';

    // Prepare FCM notification
    const notification = {
      title: '🚌 Bus Journey Started!',
      body: `Your bus for ${routeName} has started its journey. Track it live now!`,
      data: {
        type: 'TRIP_STARTED',
        busId: busId,
        routeId: routeId,
        tripId: tripId,
        driverName: driverData?.fullName || 'Driver',
        routeName: routeName
      }
    };

    // Get FCM tokens for all students
    const fcmTokens: string[] = [];
    const studentPromises = studentsSnapshot.docs.map(async (studentDoc: any) => {
      const studentData = studentDoc.data();
      if (studentData.fcmToken) {
        fcmTokens.push(studentData.fcmToken);
      }
    });

    await Promise.all(studentPromises);

    if (fcmTokens.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: 'No FCM tokens found for students',
        notifiedCount: 0 
      });
    }

    // Send FCM notifications
    const messaging = getMessaging();
    const message = {
      notification: notification,
      data: notification.data,
      tokens: fcmTokens,
      android: {
        notification: {
          icon: 'bus_icon',
          color: '#4CAF50',
          sound: 'default',
          priority: 'high' as const,
          channelId: 'bus_notifications'
        }
      },
      apns: {
        payload: {
          aps: {
            alert: notification,
            sound: 'default',
            badge: 1
          }
        }
      }
    };

    try {
      const response = await messaging.sendEachForMulticast(message);
      console.log(`✅ FCM notifications sent: ${response.successCount} successful, ${response.failureCount} failed`);
      
      return NextResponse.json({
        success: true,
        message: 'Students notified successfully',
        notifiedCount: response.successCount,
        failedCount: response.failureCount,
        totalStudents: fcmTokens.length
      });
    } catch (fcmError: any) {
      console.error('❌ FCM Error:', fcmError);
      return NextResponse.json({
        success: false,
        error: 'Failed to send notifications',
        details: fcmError.message
      }, { status: 500 });
    }

  } catch (error: any) {
    console.error('Error notifying students:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to notify students' },
      { status: 500 }
    );
  }
}
