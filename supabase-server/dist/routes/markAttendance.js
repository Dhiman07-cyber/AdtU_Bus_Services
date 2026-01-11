"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAttendance = void 0;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const supabase_js_1 = require("@supabase/supabase-js");
// Initialize Supabase client with service role key for backend operations
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const db = firebase_admin_1.default.firestore();
const markAttendance = async (req, res) => {
    var _a;
    try {
        const { studentUid, busId, status } = req.body;
        const driverUid = (_a = req.user) === null || _a === void 0 ? void 0 : _a.uid;
        if (!studentUid || !busId || !status || !driverUid) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        // Verify the driver is assigned to this bus
        const driverDoc = await db.collection('drivers').doc(driverUid).get();
        if (!driverDoc.exists) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        const driverData = driverDoc.data();
        if ((driverData === null || driverData === void 0 ? void 0 : driverData.busId) !== busId) {
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
    }
    catch (error) {
        console.error('Error marking attendance:', error);
        res.status(500).json({ error: error.message || 'Failed to mark attendance' });
    }
};
exports.markAttendance = markAttendance;
