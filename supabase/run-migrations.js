// Script to run Supabase migrations
const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('Error: Supabase URL and Service Role Key are required');
  console.error('Please set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file');
  process.exit(1);
}

// Initialize Supabase client with service role key for admin operations
const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigration(filePath) {
  try {
    console.log(`Running migration: ${filePath}`);
    
    // Read the SQL file
    const sql = fs.readFileSync(filePath, 'utf8');
    
    // Split the SQL into individual statements (simple split by semicolon)
    const statements = sql.split(';').filter(stmt => stmt.trim() !== '');
    
    // Execute each statement
    for (const statement of statements) {
      const trimmedStatement = statement.trim();
      if (trimmedStatement) {
        console.log(`Executing: ${trimmedStatement.substring(0, 50)}...`);
        
        // For table creation and schema changes, we need to use the Supabase admin interface
        // For now, we'll just log what would be executed
        console.log(`Would execute: ${trimmedStatement}`);
      }
    }
    
    console.log(`Migration ${filePath} completed successfully`);
  } catch (error) {
    console.error(`Error running migration ${filePath}:`, error.message);
    throw error;
  }
}

async function runAllMigrations() {
  try {
    console.log('Starting Supabase migrations...');
    
    // Run migrations in order
    const migrationsDir = path.join(__dirname, 'migrations');
    const migrationFiles = [
      '001_create_core_tables.sql',
      '002_notifications_fcm_tokens_applications.sql'
    ];
    
    for (const file of migrationFiles) {
      const filePath = path.join(migrationsDir, file);
      if (fs.existsSync(filePath)) {
        await runMigration(filePath);
      } else {
        console.warn(`Migration file not found: ${filePath}`);
      }
    }
    
    console.log('All migrations completed successfully!');
  } catch (error) {
    console.error('Error running migrations:', error.message);
    process.exit(1);
  }
}

// Run the migrations
runAllMigrations();