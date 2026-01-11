// Supabase schema definitions
export const SUPABASE_SCHEMA = {
  tables: [
    {
      name: 'bus_locations',
      columns: [
        { name: 'bus_id', type: 'TEXT', isPrimaryKey: true },
        { name: 'driver_uid', type: 'TEXT' },
        { name: 'lat', type: 'DOUBLE PRECISION' },
        { name: 'lng', type: 'DOUBLE PRECISION' },
        { name: 'speed', type: 'DOUBLE PRECISION' },
        { name: 'heading', type: 'DOUBLE PRECISION' },
        { name: 'accuracy', type: 'DOUBLE PRECISION' },
        { name: 'updated_at', type: 'TIMESTAMPTZ', default: 'NOW()' }
      ]
    },
    {
      name: 'driver_status',
      columns: [
        { name: 'driver_uid', type: 'TEXT', isPrimaryKey: true },
        { name: 'bus_id', type: 'TEXT' },
        { name: 'status', type: 'TEXT' },
        { name: 'last_updated', type: 'TIMESTAMPTZ', default: 'NOW()' }
      ]
    },
    {
      name: 'waiting_flags',
      columns: [
        { name: 'id', type: 'UUID', default: 'gen_random_uuid()', isPrimaryKey: true },
        { name: 'student_uid', type: 'TEXT' },
        { name: 'bus_id', type: 'TEXT' },
        { name: 'route_id', type: 'TEXT' },
        { name: 'lat', type: 'DOUBLE PRECISION' },
        { name: 'lng', type: 'DOUBLE PRECISION' },
        { name: 'created_at', type: 'TIMESTAMPTZ', default: 'NOW()' },
        { name: 'expires_at', type: 'TIMESTAMPTZ' }
      ]
    },
    {
      name: 'driver_location_updates',
      columns: [
        { name: 'id', type: 'UUID', default: 'gen_random_uuid()', isPrimaryKey: true },
        { name: 'bus_id', type: 'TEXT' },
        { name: 'driver_uid', type: 'TEXT' },
        { name: 'lat', type: 'DOUBLE PRECISION' },
        { name: 'lng', type: 'DOUBLE PRECISION' },
        { name: 'speed', type: 'DOUBLE PRECISION' },
        { name: 'heading', type: 'DOUBLE PRECISION' },
        { name: 'accuracy', type: 'DOUBLE PRECISION' },
        { name: 'created_at', type: 'TIMESTAMPTZ', default: 'NOW()' }
      ]
    }
  ],
  rlsPolicies: [
    // bus_locations policies
    `CREATE POLICY "Drivers can update their bus location" ON bus_locations 
     FOR ALL USING (driver_uid = auth.uid()) WITH CHECK (driver_uid = auth.uid());`,
    
    `CREATE POLICY "Students can read bus locations" ON bus_locations 
     FOR SELECT USING (true);`,
    
    // driver_status policies
    `CREATE POLICY "Drivers can update their status" ON driver_status 
     FOR ALL USING (driver_uid = auth.uid()) WITH CHECK (driver_uid = auth.uid());`,
    
    `CREATE POLICY "Everyone can read driver status" ON driver_status 
     FOR SELECT USING (true);`,
    
    // waiting_flags policies
    `CREATE POLICY "Students can create their own waiting flags" ON waiting_flags 
     FOR INSERT WITH CHECK (student_uid = auth.uid());`,
    
    `CREATE POLICY "Students can update their own waiting flags" ON waiting_flags 
     FOR UPDATE USING (student_uid = auth.uid()) WITH CHECK (student_uid = auth.uid());`,
    
    `CREATE POLICY "Students can delete their own waiting flags" ON waiting_flags 
     FOR DELETE USING (student_uid = auth.uid());`,
    
    `CREATE POLICY "Drivers can read waiting flags for their route" ON waiting_flags 
     FOR SELECT USING (EXISTS (
       SELECT 1 FROM drivers WHERE uid = auth.uid() AND assigned_route_id = route_id
     ));`,
    
    // driver_location_updates policies
    `CREATE POLICY "Drivers can insert location updates" ON driver_location_updates 
     FOR INSERT WITH CHECK (driver_uid = auth.uid());`,
    
    `CREATE POLICY "Admins can read location updates" ON driver_location_updates 
     FOR SELECT USING (EXISTS (
       SELECT 1 FROM users WHERE uid = auth.uid() AND role = 'admin'
     ));`
  ]
};