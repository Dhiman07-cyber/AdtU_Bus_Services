/**
 * Production Configuration for Real-time Tracking System
 * 
 * All tunable parameters for optimizing the system under load
 */

export const REALTIME_CONFIG = {
  /**
   * Driver Location Publishing Configuration
   */
  driver: {
    movingIntervalMs: 3000,       // Publish every 3s when moving
    idleIntervalMs: 10000,        // Publish every 10s when idle  
    minDistanceMeters: 5,         // Minimum distance before publishing
    speedThresholdMs: 1,          // 1 m/s threshold for movement detection
    jitterMs: 200,                // Random jitter to prevent bursts
    maxAccuracy: 50,              // Max acceptable GPS accuracy (meters)
    enableAntiSpoof: true,        // Enable anti-spoofing checks
    maxSpeedKmh: 120,            // Max reasonable speed
    maxJumpMeters: 500,          // Max teleport distance
    bufferSize: 50,              // Max offline buffer size
    
    // Native GPS options
    gpsOptions: {
      enableHighAccuracy: true,
      maximumAge: 0,
      timeout: 5000
    }
  },

  /**
   * Student Subscription Configuration
   */
  student: {
    backgroundTimeoutMs: 300000,    // 5 min background before disconnect
    reconnectDelayMs: 1000,         // Initial reconnect delay
    maxReconnectAttempts: 5,        // Max reconnection attempts
    interpolationFps: 60,           // Map animation FPS
    maxInterpolationDistance: 100,  // Max distance for smooth animation (meters)
    enableSmoothing: true,          // Enable position smoothing
    compressMessages: true,         // Use compressed message format
    
    // Subscription settings
    subscriptionTimeout: 30000,     // Subscription timeout
    keepAliveInterval: 25000,       // Keep-alive ping interval
  },

  /**
   * Waiting Flag Configuration  
   */
  waitingFlag: {
    updateIntervalMs: 8000,         // Location update every 8s
    updateJitterMs: 2000,           // 0-2s random jitter
    expiryMinutes: 15,              // Auto-expire after 15 min
    maxUpdateDistance: 50,          // Min movement for location update (meters)
    enableLocationUpdates: true,    // Enable live location updates
    enableAutoExpiry: true,         // Enable automatic expiry
    maxFlagsPerStudent: 1,          // Max concurrent flags per student
    
    // Duplicate prevention
    duplicateWindowMs: 5000,        // Prevent duplicate within 5s
    
    // GPS settings for flags
    gpsTimeout: 5000,               // GPS acquisition timeout
    gpsMaxAge: 0,                   // Don't use cached location
  },

  /**
   * Server-side Validation & Rate Limiting
   */
  server: {
    rateLimit: {
      flagCreation: {
        maxRequests: 5,             // Max flags per window
        windowMs: 60000,            // 1 minute window
      },
      locationUpdate: {
        maxRequests: 120,           // Max updates per window  
        windowMs: 60000,            // 1 minute window
      },
      general: {
        maxRequests: 100,           // General API rate limit
        windowMs: 60000,            // 1 minute window
      }
    },
    
    validation: {
      maxSpeedKmh: 120,             // Max valid speed
      maxJumpMeters: 500,           // Max valid jump
      maxAccuracyMeters: 50,        // Max acceptable accuracy
      minTimeBetweenUpdates: 500,   // Min time between updates (ms)
      maxTimeBetweenUpdates: 30000, // Max time between updates (ms)
      
      // Guwahati region bounds
      geofenceBounds: {
        north: 26.3,
        south: 25.9,
        east: 92.1,
        west: 91.4
      }
    }
  },

  /**
   * Real-time Channel Configuration
   */
  channels: {
    // Channel name patterns
    patterns: {
      busLocation: 'bus_location_{busId}',
      waitingFlags: 'waiting_flags_{busId}',
      student: 'student_{studentUid}',
      tripStatus: 'trip-status-{busId}',
      busStudents: 'bus_{busId}_students',
      driver: 'driver_{driverUid}_status'
    },
    
    // Broadcast settings
    broadcast: {
      ack: false,                   // Don't wait for acknowledgment
      self: false,                  // Don't receive own broadcasts
      maxPayloadSize: 1024,         // Max broadcast payload (bytes)
    },
    
    // Subscription settings
    subscription: {
      maxRetries: 3,                // Max subscription retries
      retryDelay: 1000,             // Retry delay (ms)
    }
  },

  /**
   * Cleanup Configuration
   */
  cleanup: {
    immediate: {
      enabled: true,                // Enable immediate cleanup on trip end
      parallel: true,               // Run Supabase cleanup in parallel
      batchSize: 500,              // Firestore batch size
      timeout: 30000,              // Cleanup timeout (ms)
    },
    
    fallback: {
      enabled: true,               // Enable 24h fallback cleanup
      ttlHours: 24,               // TTL for ephemeral data
      scanInterval: 3600000,       // Scan interval (1 hour)
    }
  },

  /**
   * Monitoring & Alerting Configuration
   */
  monitoring: {
    enabled: true,                  // Enable metrics collection
    intervalMs: 5000,              // Metrics collection interval
    
    thresholds: {
      maxConnections: 1000,        // Alert on connection surge
      maxMessagesPerSecond: 500,   // Alert on message rate
      maxLatencyP99: 2000,         // Alert on high latency (ms)
      maxErrorRate: 0.05,          // Alert on 5% error rate
      maxMemoryUsage: 0.85,        // Alert on 85% memory
      maxCpuUsage: 0.80,           // Alert on 80% CPU
    },
    
    metrics: {
      historySize: 1000,           // Latency history buffer
      errorWindowMs: 60000,        // Error rate window
      messageWindowMs: 60000,      // Message rate window
    }
  },

  /**
   * Security Configuration
   */
  security: {
    antiSpoof: {
      enabled: true,               // Enable anti-spoofing
      maxSpeedKmh: 120,           // Max valid speed
      maxJumpMeters: 500,         // Max valid jump
      historySize: 20,            // Location history for validation
      suspiciousThreshold: 10,    // Suspicious count before blacklist
    },
    
    authentication: {
      tokenExpiry: 3600,          // Token expiry (seconds)
      requireHttps: true,         // Require HTTPS in production
    },
    
    encryption: {
      enabled: true,              // Enable transport encryption
      algorithm: 'AES-256-GCM',  // Encryption algorithm
    }
  },

  /**
   * Map & UI Configuration
   */
  ui: {
    map: {
      defaultZoom: 14,            // Default map zoom level
      maxZoom: 18,               // Maximum zoom
      minZoom: 10,               // Minimum zoom
      
      animation: {
        duration: 1000,          // Animation duration (ms)
        easing: 'ease-in-out',   // Animation easing
        fps: 60,                 // Target FPS
      },
      
      markers: {
        bus: {
          icon: '/icons/bus-marker.svg',
          size: 40,
          anchor: [20, 40],
        },
        student: {
          icon: '/icons/student-marker.svg',
          size: 30,
          anchor: [15, 30],
        },
        waiting: {
          icon: '/icons/waiting-marker.svg',
          size: 35,
          anchor: [17, 35],
        }
      }
    },
    
    notifications: {
      toast: {
        duration: 4000,          // Toast duration (ms)
        position: 'top-right',   // Toast position
        maxVisible: 3,          // Max visible toasts
      }
    }
  },

  /**
   * FCM Push Notification Configuration
   */
  fcm: {
    enabled: true,               // Enable FCM
    
    // Only these events trigger FCM
    events: {
      tripStart: true,          // Send FCM on trip start
      tripEnd: true,           // Send FCM on trip end
      emergency: true,         // Send FCM for emergencies
      
      // These use in-app only
      waitingFlag: false,      // No FCM for waiting flags
      acknowledgment: false,   // No FCM for acknowledgments
      location: false,         // No FCM for location updates
    },
    
    throttle: {
      maxPerTrip: 4,           // Max FCM per trip
      windowMs: 3600000,       // Throttle window (1 hour)
    }
  },

  /**
   * Performance Optimizations
   */
  performance: {
    messageCompression: true,    // Enable message compression
    binaryProtocol: false,      // Use binary protocol (if supported)
    connectionPooling: true,    // Enable connection pooling
    
    cache: {
      routeGeometry: true,      // Cache route geometry
      ttl: 3600000,            // Cache TTL (1 hour)
    },
    
    debounce: {
      locationUpdates: 100,    // Debounce location updates (ms)
      uiUpdates: 16,          // Debounce UI updates (ms) - 60fps
    }
  },

  /**
   * Environment-specific overrides
   */
  env: {
    production: {
      debug: false,
      logLevel: 'error',
      enableMockData: false,
    },
    development: {
      debug: true,
      logLevel: 'debug',
      enableMockData: true,
    }
  }
};

/**
 * Get environment-specific config
 */
export function getConfig() {
  const env = process.env.NODE_ENV || 'development';
  const envConfig = REALTIME_CONFIG.env[env as keyof typeof REALTIME_CONFIG.env];
  
  return {
    ...REALTIME_CONFIG,
    ...envConfig
  };
}

/**
 * Configuration validator
 */
export function validateConfig(config: typeof REALTIME_CONFIG): boolean {
  // Validate intervals
  if (config.driver.movingIntervalMs < 1000) {
    console.warn('Driver moving interval too low, may cause high load');
  }
  
  if (config.waitingFlag.updateIntervalMs < 5000) {
    console.warn('Waiting flag update interval too low');
  }
  
  // Validate thresholds
  if (config.monitoring.thresholds.maxConnections < 100) {
    console.error('Max connections threshold too low for production');
    return false;
  }
  
  return true;
}

export default REALTIME_CONFIG;
