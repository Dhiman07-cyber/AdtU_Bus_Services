#!/usr/bin/env node

/**
 * Scheduled Cleanup Script for Firestore Data
 * 
 * This script can be run periodically (daily/weekly) to clean up old data
 * Usage: node scripts/scheduled-cleanup.js [daysOld] [cleanupType]
 * 
 * Examples:
 * - node scripts/scheduled-cleanup.js 30 all
 * - node scripts/scheduled-cleanup.js 7 trip_sessions
 * - node scripts/scheduled-cleanup.js 90 audit_logs
 */

const https = require('https');
const http = require('http');

// Configuration
const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN; // You'll need to set this

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;
    
    const req = client.request(url, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          resolve({ status: res.statusCode, data: result });
        } catch (error) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    
    if (options.body) {
      req.write(options.body);
    }
    
    req.end();
  });
}

async function cleanupData(daysOld = 30, cleanupType = 'all') {
  try {
    console.log(`🧹 Starting scheduled cleanup: ${cleanupType}, older than ${daysOld} days`);
    
    if (!ADMIN_TOKEN) {
      console.error('❌ ADMIN_TOKEN environment variable not set');
      process.exit(1);
    }

    const response = await makeRequest(`${BASE_URL}/api/admin/firestore-cleanup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${ADMIN_TOKEN}`
      },
      body: JSON.stringify({
        idToken: ADMIN_TOKEN,
        cleanupType: cleanupType,
        daysOld: daysOld
      })
    });

    if (response.status === 200) {
      console.log('✅ Cleanup completed successfully');
      console.log('📊 Results:', JSON.stringify(response.data.results, null, 2));
      console.log(`📅 Cleanup date: ${response.data.cutoffDate}`);
    } else {
      console.error('❌ Cleanup failed:', response.data);
      process.exit(1);
    }

  } catch (error) {
    console.error('❌ Cleanup error:', error.message);
    process.exit(1);
  }
}

async function getStats() {
  try {
    console.log('📊 Getting current data statistics...');
    
    if (!ADMIN_TOKEN) {
      console.error('❌ ADMIN_TOKEN environment variable not set');
      process.exit(1);
    }

    const response = await makeRequest(`${BASE_URL}/api/admin/firestore-cleanup?idToken=${ADMIN_TOKEN}`, {
      method: 'GET'
    });

    if (response.status === 200) {
      console.log('📊 Current data statistics:');
      console.log(JSON.stringify(response.data.stats, null, 2));
    } else {
      console.error('❌ Failed to get stats:', response.data);
    }

  } catch (error) {
    console.error('❌ Stats error:', error.message);
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('📊 Getting current statistics...');
    await getStats();
    return;
  }

  const daysOld = parseInt(args[0]) || 30;
  const cleanupType = args[1] || 'all';

  console.log(`🚀 Scheduled Cleanup Script`);
  console.log(`📅 Cleanup type: ${cleanupType}`);
  console.log(`⏰ Keep data newer than: ${daysOld} days`);
  console.log(`🌐 Base URL: ${BASE_URL}`);
  console.log('');

  await cleanupData(daysOld, cleanupType);
}

// Run the script
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { cleanupData, getStats };

