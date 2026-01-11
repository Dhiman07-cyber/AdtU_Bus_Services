const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

// Initialize Firebase Admin SDK BEFORE importing route handlers
const serviceAccount = {
  type: "service_account",
  project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
};

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Import route handlers AFTER Firebase initialization
const { startJourney } = require('./dist/routes/startJourney');
const { updateLocation } = require('./dist/routes/updateLocation');
const { raiseWaitingFlag } = require('./dist/routes/raiseFlag');
const { ackWaitingFlag } = require('./dist/routes/ackFlag');
const { markAttendance } = require('./dist/routes/markAttendance');
const { endJourney } = require('./dist/routes/endJourney');
const { proxyORS } = require('./dist/routes/proxyORS');
const { startCleanupJob } = require('./dist/jobs/cleanupWaitingFlags');

const app = express();
app.use(cors());
app.use(express.json());

// Authentication middleware
const authenticateToken = async (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    req.user = decodedToken;
    next();
  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
};

// 1️⃣ Driver Flow Endpoints

// Start Journey endpoint
app.post('/api/driver/start-journey', authenticateToken, startJourney);

// End Journey endpoint
app.post('/api/driver/end-journey', authenticateToken, endJourney);

// Send Location Update endpoint
app.post('/api/driver/location', authenticateToken, updateLocation);

// 2️⃣ Student Flow Endpoints

// Create Waiting Flag endpoint
app.post('/api/student/waiting-flag', authenticateToken, raiseWaitingFlag);

// Acknowledge Waiting Flag endpoint
app.post('/api/student/ack-waiting', authenticateToken, ackWaitingFlag);

// Update Waiting Flag endpoint (e.g., when student boards bus)
app.put('/api/student/waiting-flag/:flagId', authenticateToken, async (req, res) => {
  try {
    const { flagId } = req.params;
    const { status } = req.body;
    const studentUid = req.user.uid;

    // Verify the flag belongs to this student
    const { data: flagData, error: fetchError } = await supabase
      .from('waiting_flags')
      .select('bus_id, student_uid')
      .eq('id', flagId)
      .single();

    if (fetchError) {
      console.error('Error fetching waiting flag:', fetchError);
      return res.status(404).json({ error: 'Waiting flag not found' });
    }

    if (flagData.student_uid !== studentUid) {
      return res.status(403).json({ error: 'Not authorized to update this flag' });
    }

    // Update waiting flag status
    const { error } = await supabase
      .from('waiting_flags')
      .update({ status: status })
      .eq('id', flagId);

    if (error) {
      console.error('Error updating waiting flag:', error);
      return res.status(500).json({ error: 'Failed to update waiting flag' });
    }

    // Broadcast flag update via Supabase Realtime channel
    const channel = supabase.channel(`bus_${flagData.bus_id}_channel`);
    channel.send({
      type: "broadcast",
      event: "flag_update",
      payload: {
        id: flagId,
        status: status
      }
    });

    res.json({ success: true, message: 'Waiting flag updated successfully' });
  } catch (error) {
    console.error('Error updating waiting flag:', error);
    res.status(500).json({ error: error.message || 'Failed to update waiting flag' });
  }
});

// Remove Waiting Flag endpoint
app.delete('/api/student/waiting-flag/:flagId', authenticateToken, async (req, res) => {
  try {
    const { flagId } = req.params;
    const studentUid = req.user.uid;

    // Verify the flag belongs to this student
    const { data: flagData, error: fetchError } = await supabase
      .from('waiting_flags')
      .select('bus_id, student_uid, route_id')
      .eq('id', flagId)
      .single();

    if (fetchError) {
      console.error('Error fetching waiting flag:', fetchError);
      return res.status(404).json({ error: 'Waiting flag not found' });
    }

    if (flagData.student_uid !== studentUid) {
      return res.status(403).json({ error: 'Not authorized to delete this flag' });
    }

    // Update waiting flag status to 'removed'
    const { error } = await supabase
      .from('waiting_flags')
      .update({ status: 'removed' })
      .eq('id', flagId);

    if (error) {
      console.error('Error removing waiting flag:', error);
      return res.status(500).json({ error: 'Failed to remove waiting flag' });
    }

    // Broadcast flag removal via Supabase Realtime channel (route-based)
    const channel = supabase.channel(`route_${flagData.route_id}`);
    channel.send({
      type: "broadcast",
      event: "waiting_flag_removed",
      payload: {
        id: flagId,
        status: 'removed'
      }
    });

    res.json({ success: true, message: 'Waiting flag removed successfully' });
  } catch (error) {
    console.error('Error removing waiting flag:', error);
    res.status(500).json({ error: error.message || 'Failed to remove waiting flag' });
  }
});

// Remove Waiting Flag by Student UID endpoint
app.delete('/api/student/waiting-flag/by-student', authenticateToken, async (req, res) => {
  try {
    const studentUid = req.user.uid;

    // Find and delete waiting flag for this student
    const { data: flagData, error: fetchError } = await supabase
      .from('waiting_flags')
      .select('id, bus_id, route_id')
      .eq('student_uid', studentUid)
      .eq('status', 'waiting')
      .single();

    if (fetchError) {
      console.error('Error fetching waiting flag:', fetchError);
      return res.status(404).json({ error: 'Waiting flag not found' });
    }

    // Update waiting flag status to 'removed'
    const { error } = await supabase
      .from('waiting_flags')
      .update({ status: 'removed' })
      .eq('id', flagData.id);

    if (error) {
      console.error('Error removing waiting flag:', error);
      return res.status(500).json({ error: 'Failed to remove waiting flag' });
    }

    // Broadcast flag removal via Supabase Realtime channel (route-based)
    const channel = supabase.channel(`route_${flagData.route_id}`);
    channel.send({
      type: "broadcast",
      event: "waiting_flag_removed",
      payload: {
        id: flagData.id,
        status: 'removed'
      }
    });

    res.json({ success: true, message: 'Waiting flag removed successfully' });
  } catch (error) {
    console.error('Error removing waiting flag:', error);
    res.status(500).json({ error: error.message || 'Failed to remove waiting flag' });
  }
});

// Get Student Attendance Records endpoint
app.get('/api/student/:studentId/attendance', authenticateToken, async (req, res) => {
  try {
    const { studentId } = req.params;
    const requesterUid = req.user.uid;

    // Verify that the requester is either the student themselves or an admin/driver
    if (requesterUid !== studentId && req.user.role !== 'admin' && req.user.role !== 'driver') {
      return res.status(403).json({ error: 'Not authorized to view this student\'s attendance' });
    }

    // Fetch attendance records from Firestore
    const attendanceSnapshot = await db
      .collection('attendance')
      .where('studentUid', '==', studentId)
      .orderBy('timestamp', 'desc')
      .get();

    const attendanceRecords = [];
    attendanceSnapshot.forEach(doc => {
      attendanceRecords.push({
        id: doc.id,
        ...doc.data()
      });
    });

    res.json(attendanceRecords);
  } catch (error) {
    console.error('Error fetching attendance records:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch attendance records' });
  }
});

// 3️⃣ Moderator/Admin Flow Endpoints

// Send Notification endpoint
app.post('/api/notification', authenticateToken, async (req, res) => {
  try {
    const { title, message, type, audience, routeId } = req.body;
    const createdBy = req.user.uid;

    // Create notification in Supabase
    const notificationId = require('crypto').randomUUID();
    const timestamp = new Date().toISOString();

    const { error } = await supabase
      .from('notifications')
      .insert({
        id: notificationId,
        title,
        message,
        type,
        audience,
        created_by: createdBy,
        status: 'sent',
        created_at: timestamp
      });

    if (error) {
      console.error('Error sending notification:', error);
      return res.status(500).json({ error: 'Failed to send notification' });
    }

    // Broadcast notification via Supabase Realtime channel
    let channel;
    if (routeId) {
      // Route-specific notification
      channel = supabase.channel(`route_${routeId}`);
    } else {
      // Global notification
      channel = supabase.channel('global_notifications');
    }

    channel.send({
      type: "broadcast",
      event: "notification_update",
      payload: {
        id: notificationId,
        title,
        message,
        type,
        audience,
        created_by: createdBy,
        status: 'sent',
        created_at: timestamp,
        route_id: routeId || null
      }
    });

    // Send FCM notification if audience is specified
    if (audience) {
      try {
        let studentTokens = [];

        if (audience === 'all') {
          // Send to all students
          const studentsSnapshot = await db.collection('students').get();
          for (const doc of studentsSnapshot.docs) {
            const tokensSnapshot = await db
              .collection('fcm_tokens')
              .where('userUid', '==', doc.id)
              .get();

            tokensSnapshot.docs.forEach((tokenDoc) => {
              studentTokens.push(tokenDoc.data().deviceToken);
            });
          }
        } else if (audience === 'route' && routeId) {
          // Send to students on specific route
          const studentsSnapshot = await db
            .collection('students')
            .where('routeId', '==', routeId)
            .get();

          for (const doc of studentsSnapshot.docs) {
            const tokensSnapshot = await db
              .collection('fcm_tokens')
              .where('userUid', '==', doc.id)
              .get();

            tokensSnapshot.docs.forEach((tokenDoc) => {
              studentTokens.push(tokenDoc.data().deviceToken);
            });
          }
        }

        // Send FCM notification
        if (studentTokens.length > 0) {
          const fcmMessage = {
            notification: {
              title,
              body: message
            },
            tokens: studentTokens
          };

          await admin.messaging().sendEachForMulticast(fcmMessage);
        }
      } catch (fcmError) {
        console.error('Error sending FCM notifications:', fcmError);
      }
    }

    res.json({
      success: true,
      message: 'Notification sent successfully',
      notificationId: notificationId
    });
  } catch (error) {
    console.error('Error sending notification:', error);
    res.status(500).json({ error: error.message || 'Failed to send notification' });
  }
});

// Mark Attendance endpoint
app.post('/api/attendance', authenticateToken, markAttendance);

// 4️⃣ Data Query Endpoints
// SECURITY: All data endpoints require authentication

// Get Bus Locations
app.get('/api/bus-locations/:busId?', authenticateToken, async (req, res) => {
  try {
    const { busId } = req.params;

    let query = supabase.from('bus_locations').select('*');

    if (busId) {
      query = query.eq('bus_id', busId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching bus locations:', error);
      return res.status(500).json({ error: 'Failed to fetch bus locations' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching bus locations:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch bus locations' });
  }
});

// Get Waiting Flags (SECURITY: Requires auth)
app.get('/api/waiting-flags/:busId?', authenticateToken, async (req, res) => {
  try {
    const { busId } = req.params;
    const { status } = req.query;

    let query = supabase.from('waiting_flags').select('*');

    if (busId) {
      query = query.eq('bus_id', busId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching waiting flags:', error);
      return res.status(500).json({ error: 'Failed to fetch waiting flags' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching waiting flags:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch waiting flags' });
  }
});

// Get Driver Status (SECURITY: Requires auth)
app.get('/api/driver-status/:driverUid?', authenticateToken, async (req, res) => {
  try {
    const { driverUid } = req.params;

    let query = supabase.from('driver_status').select('*');

    if (driverUid) {
      query = query.eq('driver_uid', driverUid);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching driver status:', error);
      return res.status(500).json({ error: 'Failed to fetch driver status' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching driver status:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch driver status' });
  }
});

// Get Notifications (SECURITY: Requires auth)
app.get('/api/notifications', authenticateToken, async (req, res) => {
  try {
    const { limit = 10 } = req.query;

    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(parseInt(limit));

    if (error) {
      console.error('Error fetching notifications:', error);
      return res.status(500).json({ error: 'Failed to fetch notifications' });
    }

    res.json(data);
  } catch (error) {
    console.error('Error fetching notifications:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch notifications' });
  }
});

// Proxy ORS endpoint (SECURITY: Requires auth for external API access)
app.post('/api/proxy-ors', authenticateToken, proxyORS);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Start cleanup job
startCleanupJob();

// Start server
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Supabase integration server running on port ${PORT}`);
});