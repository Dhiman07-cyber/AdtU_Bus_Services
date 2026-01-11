// Script to initialize Supabase tables using direct PostgreSQL connection
require('dotenv').config({ path: '../.env' }); // Load environment variables from root .env file
const { Client } = require('pg');

// Get database connection URL from environment variables
const databaseUrl = process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  console.error('Error: SUPABASE_DB_URL is required');
  console.error('Please set SUPABASE_DB_URL in your .env file');
  process.exit(1);
}

async function runSqlFile(filePath) {
  // Create a new PostgreSQL client for each file
  const client = new Client({
    connectionString: databaseUrl,
  });

  try {
    console.log(`Running SQL file: ${filePath}`);
    
    // Read the SQL file
    const fs = require('fs');
    const path = require('path');
    const sql = fs.readFileSync(path.join(__dirname, filePath), 'utf8');
    
    // Connect to the database
    await client.connect();
    console.log('Connected to Supabase database');
    
    // Execute the SQL
    await client.query(sql);
    console.log(`SQL file ${filePath} executed successfully`);
  } catch (error) {
    console.error(`Error running SQL file ${filePath}:`, error.message);
    throw error;
  } finally {
    // Close the database connection
    await client.end();
    console.log(`Database connection closed for ${filePath}`);
  }
}

async function initializeTables() {
  try {
    console.log('Initializing Supabase tables...');
    
    // Run migrations in order
    await runSqlFile('migrations/001_create_core_tables.sql');
    await runSqlFile('migrations/002_notifications_fcm_tokens_applications.sql');
    
    console.log('All tables initialized successfully!');
  } catch (error) {
    console.error('Error initializing tables:', error.message);
    process.exit(1);
  }
}

// Add package.json check and install pg if needed
function checkDependencies() {
  try {
    require('pg');
    return true;
  } catch (error) {
    console.error('Error: pg module not found. Please install it with:');
    console.error('npm install pg');
    return false;
  }
}

// Run the initialization if dependencies are available
if (checkDependencies()) {
  initializeTables();
}