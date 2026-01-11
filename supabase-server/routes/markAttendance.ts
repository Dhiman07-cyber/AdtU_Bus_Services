import { Request, Response } from 'express';
import admin from 'firebase-admin';
import { createClient } from '@supabase/supabase-js';

// Extend Request type to include user property
interface AuthenticatedRequest extends Request {
  user?: {
    uid: string;
    [key: string]: any;
  };
}

// Initialize Supabase client with service role key for backend operations
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const db = admin.firestore();

export const markAttendance = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { studentUid, busId, status } = req.body;
    const driverUid = req.user?.uid;

    if (!studentUid || !busId || !status || !driverUid) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Verify the driver is assigned to this bus
    const driverDoc = await db.collection('drivers').doc(driverUid).get();
    if (!driverDoc.exists) {
      return res.status(404).json({ error: 'Driver not found' });
    }

    const driverData = driverDoc.data();
    if (driverData?.busId !== busId) {
      return res.status(403).json({ error: 'Driver not assigned to this bus' });
    }

    // Update student attendance status
    const attendanceData = {
      studentUid,
      busId,
      status, // 'present', 'absent', 'late'
      markedBy: driverUid,
      markedAt: new Date().toISOString(),
      createdAt: new Date().toISOString()
    };

    // Store attendance record in Firestore
    await db.collection('attendance').add(attendanceData);

    // Update student's attendance status
    await db.collection('students').doc(studentUid).update({
      attendanceStatus: status,
      lastAttendanceUpdate: new Date().toISOString()
    });

    // Broadcast attendance update via Supabase Realtime
    const channel = supabase.channel(`bus_${busId}_channel`);
    channel.send({
      type: "broadcast",
      event: "attendance_update",
      payload: {
        studentUid,
        status,
        markedBy: driverUid,
        markedAt: attendanceData.markedAt
      }
    });

    res.json({ 
      success: true, 
      message: 'Attendance marked successfully',
      attendance: attendanceData
    });

  } catch (error: any) {
    console.error('Error marking attendance:', error);
    res.status(500).json({ error: error.message || 'Failed to mark attendance' });
  }
};
