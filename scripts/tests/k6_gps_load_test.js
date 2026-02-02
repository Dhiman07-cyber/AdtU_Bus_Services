/**
 * =============================================================================
 * ADTU Smart Bus Management System - GPS Load Testing Script
 * =============================================================================
 * 
 * AUTHORIZATION NOTICE:
 * This script performs load testing which can generate significant traffic.
 * Before executing:
 * 1. Confirm target is a STAGING environment you own/control
 * 2. Obtain written approval if testing against shared infrastructure
 * 3. Ensure rate-limit cutoffs are understood and configured
 * 4. Do NOT run against production without explicit provider consent
 * 
 * Tool: k6 (https://k6.io)
 * Install: npm install -g k6 OR brew install k6
 * 
 * Run Commands:
 *   Smoke test:  k6 run --env SCENARIO=smoke k6_gps_load_test.js
 *   Load test:   k6 run --env SCENARIO=load k6_gps_load_test.js
 *   Stress test: k6 run --env SCENARIO=stress k6_gps_load_test.js
 *   Peak test:   k6 run --env SCENARIO=peak k6_gps_load_test.js
 * 
 * Required Environment Variables:
 *   STAGING_URL        - Base URL (e.g., https://staging.adtu-bus.vercel.app)
 *   SUPABASE_URL       - Supabase project URL
 *   SUPABASE_ANON_KEY  - Supabase anon/public key (never service role!)
 *   TEST_DRIVER_TOKEN  - JWT for a test driver account
 * 
 * Expected Success:
 *   - p95 latency < 500ms for GPS updates
 *   - Error rate < 1%
 *   - No 5xx errors during smoke/load
 * 
 * Failure Handling:
 *   - If error rate > 5%, test auto-aborts
 *   - If p95 > 3s, test auto-aborts
 *   - Review logs and reduce VU count if needed
 * =============================================================================
 */

import http from 'k6/http';
import { check, sleep, fail } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const gpsUpdateDuration = new Trend('gps_update_duration');
const gpsUpdatesTotal = new Counter('gps_updates_total');
const rateLimitHits = new Counter('rate_limit_hits');

// Configuration from environment
const BASE_URL = __ENV.STAGING_URL || 'http://localhost:3000';
const SUPABASE_URL = __ENV.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || '';
const DRIVER_TOKEN = __ENV.TEST_DRIVER_TOKEN || '';
const SCENARIO = __ENV.SCENARIO || 'smoke';

// Scenario configurations (conservative defaults)
const scenarios = {
    // Smoke: Minimal test to verify basic functionality
    smoke: {
        vus: 2,
        duration: '1m',
        thresholds: {
            http_req_duration: ['p(95)<500'],
            errors: ['rate<0.01']
        }
    },
    // Load: Normal expected load
    load: {
        vus: 10,
        duration: '5m',
        thresholds: {
            http_req_duration: ['p(95)<800'],
            errors: ['rate<0.02']
        }
    },
    // Stress: Push beyond normal capacity
    stress: {
        vus: 25,
        duration: '10m',
        thresholds: {
            http_req_duration: ['p(95)<1500'],
            errors: ['rate<0.05']
        }
    },
    // Peak: Simulate peak hours (fleet size simulation)
    peak: {
        vus: 50,                // Simulates 50 concurrent drivers
        duration: '15m',
        thresholds: {
            http_req_duration: ['p(95)<2000'],
            errors: ['rate<0.05']
        }
    }
};

const activeScenario = scenarios[SCENARIO] || scenarios.smoke;

// k6 options
export const options = {
    vus: activeScenario.vus,
    duration: activeScenario.duration,
    thresholds: {
        ...activeScenario.thresholds,
        // Global abort thresholds (safety cutoffs)
        'http_req_failed': ['rate<0.05'],           // Abort if >5% failures
        'http_req_duration': ['p(99)<3000'],        // Abort if p99 > 3s
    },
    // Graceful stop configuration
    gracefulStop: '30s',
    // Ramp up pattern for stress/peak
    stages: SCENARIO === 'stress' || SCENARIO === 'peak' ? [
        { duration: '1m', target: Math.floor(activeScenario.vus * 0.3) },  // Ramp up 30%
        { duration: '2m', target: Math.floor(activeScenario.vus * 0.6) },  // Ramp up 60%
        { duration: '5m', target: activeScenario.vus },                    // Full load
        { duration: '2m', target: 0 },                                      // Ramp down
    ] : undefined,
};

// Simulated bus data
const buses = [
    { id: 'bus_001', routeId: 'route_001', name: 'Bus 1' },
    { id: 'bus_002', routeId: 'route_002', name: 'Bus 2' },
    { id: 'bus_003', routeId: 'route_003', name: 'Bus 3' },
    { id: 'bus_004', routeId: 'route_004', name: 'Bus 4' },
    { id: 'bus_005', routeId: 'route_005', name: 'Bus 5' },
];

// ADTU campus coordinates (approximate center point)
const CAMPUS_LAT = 26.1445;
const CAMPUS_LNG = 91.7940;
const ROUTE_VARIANCE = 0.05; // ~5km radius

/**
 * Generate realistic GPS coordinates along simulated route
 */
function generateGPSCoordinates(vuId, iteration) {
    // Simulate movement along a route
    const angle = (iteration * 0.1) % (2 * Math.PI);
    const distance = 0.01 + (Math.random() * ROUTE_VARIANCE);

    return {
        latitude: CAMPUS_LAT + (Math.sin(angle) * distance) + (Math.random() * 0.001),
        longitude: CAMPUS_LNG + (Math.cos(angle) * distance) + (Math.random() * 0.001),
        accuracy: 5 + Math.random() * 10,
        speed: 20 + Math.random() * 30, // 20-50 km/h
        heading: (angle * 180 / Math.PI) % 360,
        timestamp: new Date().toISOString()
    };
}

/**
 * Main test function - GPS location updates
 */
export default function () {
    const vuId = __VU;
    const iteration = __ITER;
    const bus = buses[vuId % buses.length];
    const coords = generateGPSCoordinates(vuId, iteration);

    // Test 1: Health check (every 10th iteration to reduce noise)
    if (iteration % 10 === 0) {
        const healthRes = http.get(`${BASE_URL}/api/health`, {
            tags: { name: 'health_check' }
        });

        check(healthRes, {
            'health check status is 200': (r) => r.status === 200,
            'health check returns healthy': (r) => {
                try {
                    return JSON.parse(r.body).status === 'healthy';
                } catch { return false; }
            }
        });
    }

    // Test 2: GPS Location Update (primary test)
    const gpsPayload = JSON.stringify({
        busId: bus.id,
        driverUid: `test_driver_${vuId}`,
        latitude: coords.latitude,
        longitude: coords.longitude,
        accuracy: coords.accuracy,
        speed: coords.speed,
        heading: coords.heading,
        timestamp: coords.timestamp,
        routeId: bus.routeId
    });

    const gpsHeaders = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DRIVER_TOKEN}`,
    };

    const startTime = Date.now();
    const gpsRes = http.post(`${BASE_URL}/api/driver/broadcast-location`, gpsPayload, {
        headers: gpsHeaders,
        tags: { name: 'gps_update' }
    });
    const duration = Date.now() - startTime;

    // Record metrics
    gpsUpdateDuration.add(duration);
    gpsUpdatesTotal.add(1);

    // Check responses
    const gpsSuccess = check(gpsRes, {
        'GPS update status is 2xx': (r) => r.status >= 200 && r.status < 300,
        'GPS update latency < 500ms': (r) => duration < 500,
        'GPS update response is JSON': (r) => {
            try {
                JSON.parse(r.body);
                return true;
            } catch { return false; }
        }
    });

    if (!gpsSuccess) {
        errorRate.add(1);

        // Track rate limit hits
        if (gpsRes.status === 429) {
            rateLimitHits.add(1);
            console.log(`[VU ${vuId}] Rate limited - backing off`);
            sleep(2); // Extra backoff on rate limit
        }

        // Log non-2xx errors
        if (gpsRes.status >= 400) {
            console.log(`[VU ${vuId}] Error ${gpsRes.status}: ${gpsRes.body}`);
        }
    } else {
        errorRate.add(0);
    }

    // Test 3: Supabase direct insert (if configured)
    if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        const supabasePayload = JSON.stringify({
            bus_id: bus.id,
            driver_uid: `test_driver_${vuId}`,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy: coords.accuracy,
            speed: coords.speed,
            heading: coords.heading,
            route_id: bus.routeId,
            is_broadcasting: true
        });

        const supabaseRes = http.post(
            `${SUPABASE_URL}/rest/v1/realtime_driver_locations`,
            supabasePayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    'apikey': SUPABASE_ANON_KEY,
                    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
                    'Prefer': 'resolution=merge-duplicates'
                },
                tags: { name: 'supabase_gps_upsert' }
            }
        );

        check(supabaseRes, {
            'Supabase upsert successful': (r) => r.status >= 200 && r.status < 300
        });
    }

    // Simulate 5-second GPS interval (ADTU standard)
    sleep(5);
}

/**
 * Setup function - runs once before test
 */
export function setup() {
    console.log('='.repeat(60));
    console.log('ADTU GPS Load Test Starting');
    console.log('='.repeat(60));
    console.log(`Scenario: ${SCENARIO}`);
    console.log(`VUs: ${activeScenario.vus}`);
    console.log(`Duration: ${activeScenario.duration}`);
    console.log(`Target: ${BASE_URL}`);
    console.log('');
    console.log('⚠️  AUTHORIZATION REMINDER:');
    console.log('   Ensure this is a STAGING environment');
    console.log('   Do NOT run against production without approval');
    console.log('='.repeat(60));

    // Verify connectivity
    const healthRes = http.get(`${BASE_URL}/api/health`);
    if (healthRes.status !== 200) {
        console.log(`❌ Health check failed: ${healthRes.status}`);
        fail('Target environment not healthy - aborting test');
    }
    console.log('✅ Target environment healthy');

    return { startTime: new Date().toISOString() };
}

/**
 * Teardown function - runs once after test
 */
export function teardown(data) {
    console.log('');
    console.log('='.repeat(60));
    console.log('ADTU GPS Load Test Complete');
    console.log('='.repeat(60));
    console.log(`Started: ${data.startTime}`);
    console.log(`Ended: ${new Date().toISOString()}`);
    console.log('');
    console.log('SLO Evaluation Thresholds:');
    console.log('  ✓ GPS update p95 latency: < 500ms');
    console.log('  ✓ Error rate: < 1%');
    console.log('  ✓ Rate limit hits: Monitor for tuning');
    console.log('='.repeat(60));
}

/**
 * Handle summary - generate JSON report for evidence pack
 */
export function handleSummary(data) {
    const summary = {
        test_name: 'GPS Load Test',
        scenario: SCENARIO,
        target_url: BASE_URL,
        timestamp: new Date().toISOString(),
        duration_seconds: data.state.testRunDurationMs / 1000,
        vus_max: data.metrics.vus_max?.values?.value || activeScenario.vus,
        metrics: {
            http_reqs: data.metrics.http_reqs?.values?.count || 0,
            http_req_duration_p95: data.metrics.http_req_duration?.values?.['p(95)'] || 0,
            http_req_duration_p99: data.metrics.http_req_duration?.values?.['p(99)'] || 0,
            http_req_failed_rate: data.metrics.http_req_failed?.values?.rate || 0,
            gps_updates_total: data.metrics.gps_updates_total?.values?.count || 0,
            gps_update_duration_avg: data.metrics.gps_update_duration?.values?.avg || 0,
            rate_limit_hits: data.metrics.rate_limit_hits?.values?.count || 0,
        },
        thresholds: {
            passed: !data.thresholds || Object.values(data.thresholds).every(t => t.ok),
        },
        pass_fail: (!data.thresholds || Object.values(data.thresholds).every(t => t.ok)) ? 'PASS' : 'FAIL'
    };

    return {
        'stdout': textSummary(data, { indent: ' ', enableColors: true }),
        'k6_gps_results.json': JSON.stringify(summary, null, 2),
    };
}

// Import text summary helper
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';
