const admin = require('firebase-admin');
const busRoutesData = require('../src/data/BusRoutes.json');

// Use the same Firebase configuration as the server
const serviceAccount = {
  type: "service_account",
  project_id: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  private_key: process.env.FIREBASE_PRIVATE_KEY ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  client_email: process.env.FIREBASE_CLIENT_EMAIL,
  auth_uri: "https://accounts.google.com/o/oauth2/auth",
  token_uri: "https://oauth2.googleapis.com/token",
  auth_provider_x509_cert_url: "https://www.googleapis.com/oauth2/v1/certs"
};

// Initialize Firebase Admin SDK
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// Verified stops data with coordinates
const verifiedStops = [
  { "stopId": "stop_01", "name": "Garchuk", "lat": 26.115992, "lng": 91.682845 },
  { "stopId": "stop_02", "name": "Lokhra", "lat": 26.111778, "lng": 91.741655 },
  { "stopId": "stop_03", "name": "Lal Ganesh", "lat": 26.144812, "lng": 91.740842 },
  { "stopId": "stop_04", "name": "Beltola", "lat": 26.121342, "lng": 91.790422 },
  { "stopId": "stop_05", "name": "Ganeshguri", "lat": 26.143845, "lng": 91.789754 },
  { "stopId": "stop_06", "name": "Khanapara", "lat": 26.120425, "lng": 91.810308 },
  { "stopId": "stop_07", "name": "Narengi", "lat": 26.162471, "lng": 91.834242 },
  { "stopId": "stop_08", "name": "Noonmati", "lat": 26.169581, "lng": 91.796122 },
  { "stopId": "stop_09", "name": "Chandmari", "lat": 26.177445, "lng": 91.758431 },
  { "stopId": "stop_10", "name": "Panbazar", "lat": 26.182624, "lng": 91.745583 },
  { "stopId": "stop_11", "name": "Bamunimaidan", "lat": 26.168105, "lng": 91.779662 },
  { "stopId": "stop_12", "name": "Panikhaiti", "lat": 26.14412, "lng": 91.73592 },
  { "stopId": "stop_13", "name": "ADTU Campus", "lat": 26.14468, "lng": 91.73715 }
];

// Function to find stop by name in verified stops
function findVerifiedStop(stopName) {
  return verifiedStops.find(stop => stop.name === stopName) || null;
}

// Function to generate route distance and duration estimates
function calculateRouteMetrics(stops) {
  if (stops.length < 2) {
    return { totalDistance: 0, duration: "0 mins" };
  }
  
  let totalDistance = 0;
  for (let i = 1; i < stops.length; i++) {
    const prevStop = stops[i-1];
    const currentStop = stops[i];
    
    // Calculate distance between stops using Haversine formula
    const R = 6371; // Earth radius in km
    const dLat = (currentStop.lat - prevStop.lat) * Math.PI / 180;
    const dLon = (currentStop.lng - prevStop.lng) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(prevStop.lat * Math.PI / 180) * Math.cos(currentStop.lat * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c; // Distance in km
    
    totalDistance += distance;
  }
  
  // Estimate duration: 30 km/h average speed + 1 minute per stop
  const estimatedSpeed = 30; // km/h
  const travelTime = (totalDistance / estimatedSpeed) * 60; // Convert to minutes
  const stopTime = stops.length; // 1 minute per stop
  const totalDuration = Math.round(travelTime + stopTime);
  
  return {
    totalDistance: parseFloat(totalDistance.toFixed(1)),
    duration: `${totalDuration} mins`
  };
}

async function seedFirestore() {
  try {
    console.log('Seeding Firestore database with all buses and routes...');
    
    // Clear existing data
    console.log('Clearing existing buses collection...');
    const busesSnapshot = await db.collection('buses').get();
    if (!busesSnapshot.empty) {
      const batch1 = db.batch();
      busesSnapshot.docs.forEach(doc => {
        batch1.delete(doc.ref);
      });
      await batch1.commit();
    }
    
    console.log('Clearing existing routes collection...');
    const routesSnapshot = await db.collection('routes').get();
    if (!routesSnapshot.empty) {
      const batch2 = db.batch();
      routesSnapshot.docs.forEach(doc => {
        batch2.delete(doc.ref);
      });
      await batch2.commit();
    }
    
    // Process all routes from BusRoutes.json
    console.log('Processing routes and buses from BusRoutes.json...');
    
    // Keep track of all stops to ensure unique stopIds
    const stopMap = new Map();
    let stopCounter = 1;
    
    // Create routes and buses
    for (const [index, routeData] of busRoutesData.entries()) {
      const routeId = `route_${(index + 1).toString().padStart(2, '0')}`;
      const busId = `bus_${(index + 1).toString().padStart(2, '0')}`;
      
      // Process stops with verified coordinates
      const processedStops = routeData.stops.map((stopName, stopIndex) => {
        // Check if we already have this stop
        if (!stopMap.has(stopName)) {
          const verifiedStop = findVerifiedStop(stopName);
          if (verifiedStop) {
            stopMap.set(stopName, {
              ...verifiedStop,
              stopId: `stop_${stopCounter.toString().padStart(2, '0')}`
            });
            stopCounter++;
          } else {
            // Create a new stop with mock coordinates if not found
            stopMap.set(stopName, {
              stopId: `stop_${stopCounter.toString().padStart(2, '0')}`,
              name: stopName,
              lat: 26.1433 + (stopIndex * 0.001), // Approximate coordinates for Guwahati
              lng: 91.6172 + (stopIndex * 0.001)
            });
            stopCounter++;
          }
        }
        
        const stopInfo = stopMap.get(stopName);
        return {
          ...stopInfo,
          sequence: stopIndex + 1
        };
      });
      
      // Calculate route metrics
      const { totalDistance, duration } = calculateRouteMetrics(processedStops);
      
      // Create route document following the exact schema
      const routeDoc = {
        routeId: routeId,
        routeName: routeData.route,
        busNumber: routeData.busNumber,
        totalDistance: totalDistance,
        duration: duration,
        stops: processedStops,
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Create bus document following the exact schema
      const busDoc = {
        busId: busId,
        busNumber: routeData.busNumber,
        capacity: Math.floor(routeData.stops.length * 2.5), // Estimate capacity based on stops
        routeId: routeId,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date()
      };
      
      // Add route to Firestore
      await db.collection('routes').doc(routeId).set(routeDoc);
      console.log(`Added route: ${routeData.route} with ${processedStops.length} stops`);
      
      // Add bus to Firestore
      await db.collection('buses').doc(busId).set(busDoc);
      console.log(`Added bus: ${routeData.busNumber}`);
    }
    
    console.log('Firestore seeding completed successfully!');
    console.log(`Total routes processed: ${busRoutesData.length}`);
    console.log(`Total buses processed: ${busRoutesData.length}`);
    console.log(`Total unique stops: ${stopMap.size}`);
    
    process.exit(0);
  } catch (error) {
    console.error('Error seeding Firestore:', error);
    process.exit(1);
  }
}

// Load environment variables
require('dotenv').config({ path: '../.env' });

seedFirestore();