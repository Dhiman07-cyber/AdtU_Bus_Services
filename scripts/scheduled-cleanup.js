#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Scheduled Cleanup Script for Firestore/Supabase Data
 *
 * Usage:
 *   node scripts/scheduled-cleanup.js [daysOld] [cleanupType]
 *
 * Examples:
 *   node scripts/scheduled-cleanup.js 30 all
 *   node scripts/scheduled-cleanup.js 7 active_trips
 *   node scripts/scheduled-cleanup.js 90 reassignment_logs
 */

const https = require('https');
const http = require('http');

const ADMIN_TOKEN = process.env.ADMIN_TOKEN;

function resolveBaseUrl() {
  const configuredUrl = process.env.APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000');

  const url = new URL(configuredUrl);
  const isLocalHost = ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  const isProduction = process.env.NODE_ENV === 'production';

  if (isProduction && url.protocol !== 'https:' && !isLocalHost) {
    throw new Error('Production cleanup URL must use HTTPS');
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('Cleanup URL must use HTTP or HTTPS');
  }

  return url.origin;
}

const BASE_URL = resolveBaseUrl();

async function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const client = parsedUrl.protocol === 'https:' ? https : http;

    const req = client.request(parsedUrl, options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
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

function requireAdminToken() {
  if (!ADMIN_TOKEN) {
    console.error('ADMIN_TOKEN environment variable not set');
    process.exit(1);
  }
}

function authHeaders(extraHeaders = {}) {
  return {
    ...extraHeaders,
    Authorization: `Bearer ${ADMIN_TOKEN}`,
  };
}

async function cleanupData(daysOld = 30, cleanupType = 'all') {
  try {
    console.log(`Starting scheduled cleanup: ${cleanupType}, older than ${daysOld} days`);
    requireAdminToken();

    const response = await makeRequest(`${BASE_URL}/api/admin/firestore-cleanup`, {
      method: 'POST',
      headers: authHeaders({
        'Content-Type': 'application/json',
      }),
      body: JSON.stringify({
        cleanupType,
        daysOld,
      })
    });

    if (response.status === 200) {
      console.log('Cleanup completed successfully');
      console.log('Results:', JSON.stringify(response.data.results, null, 2));
      console.log(`Cleanup date: ${response.data.cutoffDate}`);
    } else {
      console.error('Cleanup failed:', response.data);
      process.exit(1);
    }
  } catch (error) {
    console.error('Cleanup error:', error.message);
    process.exit(1);
  }
}

async function getStats() {
  try {
    console.log('Getting current data statistics...');
    requireAdminToken();

    const response = await makeRequest(`${BASE_URL}/api/admin/firestore-cleanup`, {
      method: 'GET',
      headers: authHeaders(),
    });

    if (response.status === 200) {
      console.log('Current data statistics:');
      console.log(JSON.stringify(response.data.stats, null, 2));
    } else {
      console.error('Failed to get stats:', response.data);
      process.exit(1);
    }
  } catch (error) {
    console.error('Stats error:', error.message);
    process.exit(1);
  }
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    await getStats();
    return;
  }

  const daysOld = Number.parseInt(args[0], 10) || 30;
  const cleanupType = args[1] || 'all';

  console.log('Scheduled Cleanup Script');
  console.log(`Cleanup type: ${cleanupType}`);
  console.log(`Keep data newer than: ${daysOld} days`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log('');

  await cleanupData(daysOld, cleanupType);
}

if (require.main === module) {
  main().catch((error) => {
    console.error('Unexpected cleanup failure:', error.message);
    process.exit(1);
  });
}

module.exports = { cleanupData, getStats };
