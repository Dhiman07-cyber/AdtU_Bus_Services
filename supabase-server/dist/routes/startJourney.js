"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startJourney = startJourney;
const firebase_admin_1 = __importDefault(require("firebase-admin"));
const supabase_js_1 = require("@supabase/supabase-js");
// Initialize Supabase client with service role key for backend operations
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.SUPABASE_SERVICE_ROLE_KEY || '');
const db = firebase_admin_1.default.firestore();
// Function to get route by bus number from local JSON data
function getOfflineRouteByBusNumber(busNumber) {
    try {
        // Import the JSON data directly
        const busRoutesData = require('../../src/data/BusRoutes.json');
        const route = busRoutesData.find((r) => r.busNumber === busNumber);
        if (route) {
            return {
                id: route.id,
                routeId: `route-${route.id}`,
                routeName: route.route,
                busNumber: route.busNumber,
                stops: route.stops.map((stop, index) => ({
                    name: stop,
                    lat: 26.1433 + (index * 0.001),
                    lng: 91.6172 + (index * 0.001)
                })),
                status: 'active',
                createdAt: new Date().toISOString()
            };
        }
        return null;
    }
    catch (error) {
        console.error('Error loading offline route by bus number:', error);
        return null;
    }
}
async function startJourney(req, res) {
    var _a;
    try {
        const { busId } = req.body;
        const driverUid = (_a = req.user) === null || _a === void 0 ? void 0 : _a.uid;
        if (!driverUid) {
            return res.status(401).json({ error: 'User not authenticated' });
        }
        // Verify that the driver is assigned to this bus
        const driverDoc = await db.collection('drivers').doc(driverUid).get();
        if (!driverDoc.exists) {
            return res.status(404).json({ error: 'Driver not found' });
        }
        const driverData = driverDoc.data();
        if ((driverData === null || driverData === void 0 ? void 0 : driverData.assignedBusId) !== busId) {
            return res.status(403).json({ error: 'Driver is not assigned to this bus' });
        }
        const timestamp = new Date().toISOString();
        // Get bus document to get the route ID
        console.log('Fetching bus document for busId:', busId);
        const busDoc = await db.collection('buses').doc(busId).get();
        if (!busDoc.exists) {
            console.error('Bus document not found for busId:', busId);
            return res.status(400).json({ error: 'Bus not found in database' });
        }
        const busData = busDoc.data();
        console.log('Bus data:', busData);
        // Get route ID from bus document
        const routeId = busData === null || busData === void 0 ? void 0 : busData.routeId;
        // Check if routeId is valid (not null, undefined, or empty string)
        if (!routeId || routeId === '') {
            console.error('Bus is not assigned to a route. Bus data:', busData);
            return res.status(400).json({
                error: 'Bus is not assigned to a route. Please contact administrator to assign a route to this bus.',
                busId: busId,
                busData: {
                    busId: busId,
                    busNumber: (busData === null || busData === void 0 ? void 0 : busData.busNumber) || 'Unknown',
                    routeId: (busData === null || busData === void 0 ? void 0 : busData.routeId) || 'Not assigned',
                    driverUID: (busData === null || busData === void 0 ? void 0 : busData.driverUID) || 'Not assigned'
                }
            });
        }
        // Update Firestore: buses/{busId} → set status = "enroute"
        await db.collection('buses').doc(busId).update({
            status: 'enroute',
            driverUID: driverUid,
            lastStartedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase_admin_1.default.firestore.FieldValue.serverTimestamp()
        });
        // Update Supabase driver_status
        const { error: driverStatusError } = await supabase
            .from('driver_status')
            .upsert({
            driver_uid: driverUid,
            bus_id: busId,
            status: 'on_route',
            last_updated: timestamp
        });
        if (driverStatusError) {
            console.error('Error updating driver status:', driverStatusError);
            return res.status(500).json({ error: 'Failed to update driver status' });
        }
        // Initialize bus location in Supabase
        const { error: busLocationError } = await supabase
            .from('bus_locations')
            .upsert({
            bus_id: busId,
            driver_uid: driverUid,
            lat: null,
            lng: null,
            speed: 0,
            heading: 0,
            updated_at: timestamp
        });
        if (busLocationError) {
            console.error('Error initializing bus location:', busLocationError);
            return res.status(500).json({ error: 'Failed to initialize bus location' });
        }
        // Broadcast bus_started event via Supabase Realtime channel (route-based)
        const channel = supabase.channel(`route_${routeId}`);
        channel.subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log(`Successfully subscribed to route_${routeId} channel for broadcasting`);
                // Send the broadcast after successful subscription
                channel.send({
                    type: "broadcast",
                    event: "bus_started",
                    payload: {
                        busId,
                        routeId,
                        driverUid,
                        ts: timestamp
                    }
                }).then((result) => {
                    console.log('Broadcast result:', result);
                }).catch((error) => {
                    console.error('Error sending broadcast:', error);
                });
            }
            else {
                console.log(`Channel subscription status for route_${routeId}:`, status);
            }
        });
        // Send FCM notification to all students assigned to this route
        try {
            const studentsSnapshot = await db
                .collection('students')
                .where('routeId', '==', routeId)
                .get();
            const studentTokens = [];
            for (const doc of studentsSnapshot.docs) {
                const student = doc.data();
                // Get FCM tokens for this student
                const tokensSnapshot = await db
                    .collection('fcm_tokens')
                    .where('userUid', '==', doc.id)
                    .get();
                tokensSnapshot.docs.forEach((tokenDoc) => {
                    studentTokens.push(tokenDoc.data().deviceToken);
                });
            }
            // Send FCM notification
            if (studentTokens.length > 0) {
                // For newer Firebase versions, use sendEachForMulticast instead of sendMulticast
                const message = {
                    notification: {
                        title: 'Bus Started',
                        body: `Bus ${busId} has started its journey on route ${routeId}`
                    },
                    tokens: studentTokens
                };
                // Using sendEach instead of sendEachForMulticast for better compatibility
                const response = await firebase_admin_1.default.messaging().sendEach(studentTokens.map(token => ({
                    token,
                    notification: {
                        title: 'Bus Started',
                        body: `Bus ${busId} has started its journey on route ${routeId}`
                    }
                })));
                console.log('Successfully sent message:', response);
            }
        }
        catch (fcmError) {
            console.error('Error sending FCM notifications:', fcmError);
        }
        res.json({
            success: true,
            message: 'Journey started successfully',
            routeId,
            ts: timestamp
        });
    }
    catch (error) {
        console.error('Error starting journey:', error);
        res.status(500).json({ error: error.message || 'Failed to start journey' });
    }
}
