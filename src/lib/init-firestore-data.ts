import { db } from '@/lib/firebase';
import { collection, doc, setDoc, Timestamp } from 'firebase/firestore';

// Initialize Firestore with buses and routes data
export const initFirestoreData = async () => {
  try {
    console.log('Initializing Firestore with sample buses and routes data...');

    // Sample route data
    const sampleRoutes = [
      {
        routeId: 'route_1',
        routeName: 'Route-1',
        stops: [
          { stopId: 'stop_1', name: 'Boragaon', lat: 26.1365, lng: 91.6784, sequence: 1 },
          { stopId: 'stop_2', name: 'ADTU Campus', lat: 26.1440, lng: 91.7360, sequence: 2 }
        ],
        numberOfBuses: 1,
        status: 'active',
        createdAt: Timestamp.now()
      }
    ];

    // Sample bus data
    const sampleBuses = [
      {
        busId: 'bus_1',
        busNumber: 'AS-01-FC-7127',
        model: 'Volvo',
        capacity: 50,
        routeId: 'route_1',
        status: 'idle',
        currentPassengerCount: 0,
        createdAt: Timestamp.now()
      }
    ];

    // Process each route
    for (const route of sampleRoutes) {
      // Save route to Firestore
      await setDoc(doc(collection(db, 'routes'), route.routeId), route);
      console.log(`Route ${route.routeId} saved to Firestore`);
    }

    // Process each bus
    for (const bus of sampleBuses) {
      // Save bus to Firestore
      await setDoc(doc(collection(db, 'buses'), bus.busId), bus);
      console.log(`Bus ${bus.busId} saved to Firestore`);
    }

    console.log('Firestore initialization completed successfully!');
    return true;
  } catch (error) {
    console.error('Error initializing Firestore data:', error);
    return false;
  }
};

// We'll remove the direct execution part since it was causing issues