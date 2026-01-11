import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// Sample data from BusRoutes.json
const busRoutesData = [
  {
    "id": 1,
    "route": "Route-1",
    "busNumber": "AS-01-FC-7127",
    "stops": [
      "Garchuk", "ISBT", "Lokhra", "Nalapara", "Beharbari", "Lalmati",
      "Basistha Charili", "A.G. Bus Stop", "Beltola Tiniali", "Nandanpur Path",
      "Survey", "Wireless", "Last Gate", "Ganesh Mandir", "Ganeshguri",
      "Zoo Tiniali", "Geeta Mandir P.S.", "Hatigarh Chariali", "Geetamandir",
      "Mothghoria", "Narengi", "ADTU"
    ]
  },
  {
    "id": 2,
    "route": "Route-2",
    "busNumber": "AS-01-FC-7128",
    "stops": [
      "Jalukbari", "Adabari Tiniali", "Maligoan", "Maligoan No. 3", "Kamakhya Gate",
      "Bhootnath", "Bharalumukh", "Fancy Bazar", "Kachari", "Guwahati Club",
      "Goswami Service", "Chandmari", "Anuradha", "New Guwahati", "Noonmati",
      "Narengi", "ADTU"
    ]
  },
  {
    "id": 3,
    "route": "Route-3",
    "busNumber": "AS-01-DD-2697",
    "stops": [
      "down town Hospital", "Sixmile", "Barbari", "Pratiksha Hospital", "Magzine",
      "Patharkuwari", "Narengi", "ADTU"
    ]
  },
  {
    "id": 4,
    "route": "Route-4",
    "busNumber": "AS-01-KC-0757",
    "stops": [
      "A.T Road", "Paltan Bazar", "Ulubari", "Lachitnagar", "Bhangagarh", "Post Office",
      "Christian Basti", "Ganeshguri", "down town", "Sixmile", "Chandan-Nagar",
      "Barbari", "Patharkuwari", "Narengi", "ADTU"
    ]
  },
  {
    "id": 5,
    "route": "Route-5",
    "busNumber": "AS-01-LC-5321",
    "stops": [
      "Kerakuchi", "Ghoramara", "Bhetapara", "Hatigoan P.S", "Hatigoan Bus Stop",
      "High School", "Sewali Path", "Lakhimi Nagar", "Rajdhani Masjid", "Jonali",
      "Gitanagar PS", "B G Tiniali", "Motghoria", "ADTU"
    ]
  },
  {
    "id": 6,
    "route": "Route-6",
    "busNumber": "AS-01-DD-9704",
    "stops": [
      "Guwahati Club", "Silpukhuri", "Goswami Service", "Chandmari Fly Over",
      "Anuradha", "FCI", "New Guwahati", "Noonmati", "Sector-3", "Carbon Gate",
      "Narengi", "ADTU"
    ]
  },
  {
    "id": 7,
    "route": "Route-7",
    "busNumber": "AS-01-DD-2696",
    "stops": [
      "down town Hospital", "Sixmile", "Chandan-nagar", "Barbari", "Pratiksha Hospital",
      "Magzine", "Patharkuwari", "Narengi", "ADTU"
    ]
  },
  {
    "id": 8,
    "route": "Route-8",
    "busNumber": "AS-01-DD-9705",
    "stops": [
      "Khanapara", "Farm Gate", "Sixmile", "Chandan-nagar", "Barbari",
      "Pratiksha Hospital", "Patharkuwari", "Narengi", "ADTU"
    ]
  },
  {
    "id": 9,
    "route": "Route-9",
    "busNumber": "AS-01-HC-4906",
    "stops": [
      "Lal-Ganesh", "Kahilipara", "Ganeshguri", "Ganesh Mandir", "Nursery",
      "State Zoo", "Zoo Tiniali", "Gitanagar PS", "Hatigarh Chariali",
      "Narengi", "ADTU"
    ]
  },
  {
    "id": 10,
    "route": "Route-10",
    "busNumber": "AS-01-JC-5827",
    "stops": [
      "Maligaon Gate No. 3", "Kamakhya Gate", "Kalipur", "Bhootnath",
      "Bharalumukh", "Fancy Bazar", "Kachari", "Guwahati Club", "Goswami Service",
      "Chandmari", "Gauhati Commerce College", "Zoo Road Tiniali", "Gitanagar PS",
      "Narengi", "ADTU"
    ]
  },
  {
    "id": 11,
    "route": "Route-11",
    "busNumber": "AS-01-FC-1173",
    "stops": [
      "down town Hospital", "Super Market", "Last gate", "Rajdhani Masjid",
      "Ganeshguri Mandir", "Ganeshguri", "Nursery", "State Zoo", "Jonali",
      "Zoo Tiniali", "Gitanagar PS", "Hatigarh Chariali", "Geeta Mandir",
      "B G Tiniali", "Motghoria", "Narengi", "ADTU"
    ]
  },
  {
    "id": 12,
    "route": "Route-12",
    "busNumber": "AS-01-FC-1172",
    "stops": [
      "down town Hospital", "Sixmile", "Chandan-nagar", "Barbari", "Pratiksha Hospital",
      "Magzine", "Patharkuwari", "Narengi", "ADTU"
    ]
  }
];

export async function initializeSupabaseData() {
  try {
    console.log('Starting Supabase data initialization...');
    
    // 1. Insert routes data
    console.log('Inserting routes data...');
    const routesData = busRoutesData.map(route => ({
      route_id: route.route,
      route_name: `Route ${route.id}`,
      stops: JSON.stringify(route.stops.map((stop, index) => ({
        stop_id: `stop-${route.id}-${index + 1}`,
        stop_name: stop,
        sequence: index + 1
      }))),
      number_of_buses: 1,
      estimated_time_minutes: 30 + Math.floor(Math.random() * 30),
      status: 'active'
    }));
    
    const { error: routesError } = await supabase
      .from('routes')
      .insert(routesData);
    
    if (routesError) {
      console.error('Error inserting routes:', routesError);
      return { success: false, error: `Failed to insert routes: ${routesError.message}` };
    }
    console.log('Routes inserted successfully');
    
    // 2. Insert buses data
    console.log('Inserting buses data...');
    const busesData = busRoutesData.map(route => ({
      bus_id: route.busNumber,
      bus_number: route.busNumber,
      model: 'Volvo',
      capacity: 50,
      driver_uid: null,
      route_id: route.route,
      status: 'idle',
      current_passenger_count: 0
    }));
    
    const { error: busesError } = await supabase
      .from('buses')
      .insert(busesData);
    
    if (busesError) {
      console.error('Error inserting buses:', busesError);
      return { success: false, error: `Failed to insert buses: ${busesError.message}` };
    }
    console.log('Buses inserted successfully');
    
    // 3. Insert sample bus locations (initially empty)
    console.log('Inserting initial bus locations...');
    const busLocationsData = busRoutesData.map(route => ({
      bus_id: route.busNumber,
      driver_uid: null,
      lat: null,
      lng: null,
      speed: 0,
      heading: 0
    }));
    
    const { error: busLocationsError } = await supabase
      .from('bus_locations')
      .insert(busLocationsData);
    
    if (busLocationsError) {
      console.error('Error inserting bus locations:', busLocationsError);
      return { success: false, error: `Failed to insert bus locations: ${busLocationsError.message}` };
    }
    console.log('Bus locations inserted successfully');
    
    // 4. Insert sample driver status (initially offline)
    console.log('Inserting initial driver status...');
    // We'll skip this for now since we don't have driver UIDs yet
    
    console.log('Supabase data initialization completed successfully');
    return { success: true, message: 'Supabase data initialized successfully' };
  } catch (error) {
    console.error('Error initializing Supabase data:', error);
    return { success: false, error: `Failed to initialize Supabase data: ${error instanceof Error ? error.message : 'Unknown error'}` };
  }
}