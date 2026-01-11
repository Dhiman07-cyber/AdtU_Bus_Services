// Script to initialize Supabase tables with sample data
const { createClient } = require('@supabase/supabase-js');

// Initialize Supabase client
const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Sample data
const sampleRoutes = [
  {
    route_id: 'route_001',
    name: 'Route 1',
    description: 'Main route from campus to city center',
    stops: ['Stop A', 'Stop B', 'Stop C'],
    created_at: new Date().toISOString()
  },
  {
    route_id: 'route_002',
    name: 'Route 2',
    description: 'Route to residential area',
    stops: ['Stop D', 'Stop E', 'Stop F'],
    created_at: new Date().toISOString()
  }
];

const sampleBuses = [
  {
    bus_id: 'AS-01-DD-9704',
    route_id: 'route_001',
    driver_uid: null,
    status: 'idle',
    capacity: 50,
    current_passenger_count: 0,
    created_at: new Date().toISOString()
  },
  {
    bus_id: 'AS-01-DD-9705',
    route_id: 'route_002',
    driver_uid: null,
    status: 'idle',
    capacity: 45,
    current_passenger_count: 0,
    created_at: new Date().toISOString()
  }
];

const sampleDriverStatus = [
  {
    driver_uid: 'driver_001',
    bus_id: 'AS-01-DD-9704',
    status: 'offline',
    last_updated: new Date().toISOString()
  },
  {
    driver_uid: 'driver_002',
    bus_id: 'AS-01-DD-9705',
    status: 'offline',
    last_updated: new Date().toISOString()
  }
];

async function initializeData() {
  try {
    console.log('Initializing Supabase tables with sample data...');
    
    // Insert sample routes
    const { error: routesError } = await supabase
      .from('routes')
      .upsert(sampleRoutes, { onConflict: 'route_id' });
    
    if (routesError) {
      console.error('Error inserting routes:', routesError);
    } else {
      console.log('Routes inserted successfully');
    }
    
    // Insert sample buses
    const { error: busesError } = await supabase
      .from('buses')
      .upsert(sampleBuses, { onConflict: 'bus_id' });
    
    if (busesError) {
      console.error('Error inserting buses:', busesError);
    } else {
      console.log('Buses inserted successfully');
    }
    
    // Insert sample driver status
    const { error: driverStatusError } = await supabase
      .from('driver_status')
      .upsert(sampleDriverStatus, { onConflict: 'driver_uid' });
    
    if (driverStatusError) {
      console.error('Error inserting driver status:', driverStatusError);
    } else {
      console.log('Driver status inserted successfully');
    }
    
    console.log('Sample data initialization completed');
  } catch (error) {
    console.error('Error initializing sample data:', error);
  }
}

// Run the initialization
initializeData();