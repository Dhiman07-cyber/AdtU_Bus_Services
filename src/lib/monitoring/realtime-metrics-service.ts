/**
 * Real-time Metrics Service - Production Monitoring
 * 
 * Collects and reports system metrics:
 * - Active connections
 * - Message rates
 * - Latency metrics
 * - Error tracking
 * - Resource usage
 */

interface MetricSnapshot {
  timestamp: string;
  connections: {
    drivers: number;
    students: number;
    total: number;
  };
  messages: {
    publishedPerSecond: number;
    broadcastPerSecond: number;
    totalBytes: number;
    averageSize: number;
  };
  latency: {
    p50: number;
    p95: number;
    p99: number;
  };
  errors: {
    authFailures: number;
    invalidWrites: number;
    rateLimitRejects: number;
    total: number;
  };
  resources: {
    memoryUsage: number;
    cpuUsage: number;
    networkBandwidth: number;
  };
  flags: {
    active: number;
    acknowledged: number;
    expired: number;
    totalToday: number;
  };
}

interface AlertThresholds {
  maxConnections: number;         // Default: 1000
  maxMessagesPerSecond: number;   // Default: 500
  maxLatencyP99: number;          // Default: 2000ms
  maxErrorRate: number;           // Default: 0.05 (5%)
  maxMemoryUsage: number;         // Default: 0.85 (85%)
  maxCpuUsage: number;            // Default: 0.80 (80%)
}

export class RealtimeMetricsService {
  private metrics: MetricSnapshot;
  private messageTimestamps: number[] = [];
  private errorTimestamps: number[] = [];
  private latencyBuffer: number[] = [];
  private connectionCounts: Map<string, Set<string>> = new Map();
  private alertThresholds: AlertThresholds;
  private metricsInterval: NodeJS.Timeout | null = null;
  private reportCallback: ((metrics: MetricSnapshot) => void) | null = null;
  private alertCallback: ((alert: Alert) => void) | null = null;

  constructor(thresholds?: Partial<AlertThresholds>) {
    this.alertThresholds = {
      maxConnections: 1000,
      maxMessagesPerSecond: 500,
      maxLatencyP99: 2000,
      maxErrorRate: 0.05,
      maxMemoryUsage: 0.85,
      maxCpuUsage: 0.80,
      ...thresholds
    };

    this.metrics = this.createEmptySnapshot();
    this.connectionCounts.set('drivers', new Set());
    this.connectionCounts.set('students', new Set());
  }

  /**
   * Start collecting metrics
   */
  public start(
    intervalMs: number = 5000,
    onReport?: (metrics: MetricSnapshot) => void,
    onAlert?: (alert: Alert) => void
  ): void {
    this.reportCallback = onReport || null;
    this.alertCallback = onAlert || null;

    this.metricsInterval = setInterval(() => {
      this.collectMetrics();
    }, intervalMs);

    console.log(`📊 Metrics collection started (every ${intervalMs}ms)`);
  }

  /**
   * Stop collecting metrics
   */
  public stop(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
      this.metricsInterval = null;
    }
    console.log('📊 Metrics collection stopped');
  }

  /**
   * Record a connection
   */
  public recordConnection(type: 'driver' | 'student', id: string): void {
    const connections = this.connectionCounts.get(`${type}s`);
    if (connections) {
      connections.add(id);
    }
  }

  /**
   * Record a disconnection
   */
  public recordDisconnection(type: 'driver' | 'student', id: string): void {
    const connections = this.connectionCounts.get(`${type}s`);
    if (connections) {
      connections.delete(id);
    }
  }

  /**
   * Record a message
   */
  public recordMessage(sizeBytes: number, direction: 'publish' | 'broadcast'): void {
    const now = Date.now();
    this.messageTimestamps.push(now);
    
    // Clean old timestamps (keep last 60 seconds)
    const cutoff = now - 60000;
    this.messageTimestamps = this.messageTimestamps.filter(t => t > cutoff);
  }

  /**
   * Record latency
   */
  public recordLatency(latencyMs: number): void {
    this.latencyBuffer.push(latencyMs);
    
    // Keep only last 1000 samples
    if (this.latencyBuffer.length > 1000) {
      this.latencyBuffer.shift();
    }
  }

  /**
   * Record an error
   */
  public recordError(type: 'auth' | 'invalid' | 'rateLimit' | 'other'): void {
    const now = Date.now();
    this.errorTimestamps.push(now);
    
    // Clean old timestamps (keep last 60 seconds)
    const cutoff = now - 60000;
    this.errorTimestamps = this.errorTimestamps.filter(t => t > cutoff);
    
    // Increment specific error counter
    switch (type) {
      case 'auth':
        this.metrics.errors.authFailures++;
        break;
      case 'invalid':
        this.metrics.errors.invalidWrites++;
        break;
      case 'rateLimit':
        this.metrics.errors.rateLimitRejects++;
        break;
    }
    this.metrics.errors.total++;
  }

  /**
   * Record a waiting flag event
   */
  public recordWaitingFlag(event: 'created' | 'acknowledged' | 'expired'): void {
    switch (event) {
      case 'created':
        this.metrics.flags.active++;
        this.metrics.flags.totalToday++;
        break;
      case 'acknowledged':
        this.metrics.flags.active--;
        this.metrics.flags.acknowledged++;
        break;
      case 'expired':
        this.metrics.flags.active--;
        this.metrics.flags.expired++;
        break;
    }
  }

  /**
   * Collect current metrics
   */
  private collectMetrics(): void {
    const now = Date.now();
    
    // Update connection counts
    this.metrics.connections = {
      drivers: this.connectionCounts.get('drivers')?.size || 0,
      students: this.connectionCounts.get('students')?.size || 0,
      total: (this.connectionCounts.get('drivers')?.size || 0) + 
             (this.connectionCounts.get('students')?.size || 0)
    };

    // Calculate message rates
    const recentMessages = this.messageTimestamps.filter(t => t > now - 1000);
    this.metrics.messages.publishedPerSecond = recentMessages.length;
    this.metrics.messages.broadcastPerSecond = recentMessages.length; // Simplified

    // Calculate latency percentiles
    if (this.latencyBuffer.length > 0) {
      const sorted = [...this.latencyBuffer].sort((a, b) => a - b);
      this.metrics.latency = {
        p50: this.percentile(sorted, 50),
        p95: this.percentile(sorted, 95),
        p99: this.percentile(sorted, 99)
      };
    }

    // Calculate error rate
    const recentErrors = this.errorTimestamps.filter(t => t > now - 60000);
    const errorRate = recentErrors.length / 60; // Errors per second

    // Get system resources
    this.metrics.resources = this.getSystemResources();

    // Update timestamp
    this.metrics.timestamp = new Date().toISOString();

    // Check for alerts
    this.checkAlerts(errorRate);

    // Report metrics
    if (this.reportCallback) {
      this.reportCallback(this.metrics);
    }

    // Log summary
    console.log(`📊 Metrics: ${this.metrics.connections.total} connections, ` +
               `${this.metrics.messages.publishedPerSecond} msg/s, ` +
               `${this.metrics.latency.p99}ms p99 latency`);
  }

  /**
   * Check for alert conditions
   */
  private checkAlerts(errorRate: number): void {
    const alerts: Alert[] = [];

    // Connection surge
    if (this.metrics.connections.total > this.alertThresholds.maxConnections) {
      alerts.push({
        level: 'warning',
        type: 'connection_surge',
        message: `High connection count: ${this.metrics.connections.total}`,
        value: this.metrics.connections.total,
        threshold: this.alertThresholds.maxConnections
      });
    }

    // High message rate
    if (this.metrics.messages.publishedPerSecond > this.alertThresholds.maxMessagesPerSecond) {
      alerts.push({
        level: 'warning',
        type: 'high_message_rate',
        message: `High message rate: ${this.metrics.messages.publishedPerSecond}/s`,
        value: this.metrics.messages.publishedPerSecond,
        threshold: this.alertThresholds.maxMessagesPerSecond
      });
    }

    // High latency
    if (this.metrics.latency.p99 > this.alertThresholds.maxLatencyP99) {
      alerts.push({
        level: 'error',
        type: 'high_latency',
        message: `High p99 latency: ${this.metrics.latency.p99}ms`,
        value: this.metrics.latency.p99,
        threshold: this.alertThresholds.maxLatencyP99
      });
    }

    // High error rate
    if (errorRate > this.alertThresholds.maxErrorRate) {
      alerts.push({
        level: 'error',
        type: 'high_error_rate',
        message: `High error rate: ${(errorRate * 100).toFixed(2)}%`,
        value: errorRate,
        threshold: this.alertThresholds.maxErrorRate
      });
    }

    // High memory usage
    if (this.metrics.resources.memoryUsage > this.alertThresholds.maxMemoryUsage) {
      alerts.push({
        level: 'critical',
        type: 'high_memory',
        message: `High memory usage: ${(this.metrics.resources.memoryUsage * 100).toFixed(1)}%`,
        value: this.metrics.resources.memoryUsage,
        threshold: this.alertThresholds.maxMemoryUsage
      });
    }

    // Send alerts
    if (this.alertCallback) {
      alerts.forEach(alert => {
        this.alertCallback!(alert);
        console.error(`🚨 ALERT [${alert.level}]: ${alert.message}`);
      });
    }
  }

  /**
   * Calculate percentile
   */
  private percentile(sorted: number[], p: number): number {
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Get system resources (simplified for browser)
   */
  private getSystemResources(): { memoryUsage: number; cpuUsage: number; networkBandwidth: number } {
    let memoryUsage = 0;
    let cpuUsage = 0;

    // Get memory usage if available
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      memoryUsage = memory.usedJSHeapSize / memory.jsHeapSizeLimit;
    }

    // CPU usage would require Web Workers or server-side monitoring
    // Network bandwidth would require Network Information API

    return {
      memoryUsage: Math.min(1, memoryUsage),
      cpuUsage: 0, // Not available in browser
      networkBandwidth: 0 // Not reliably available
    };
  }

  /**
   * Create empty snapshot
   */
  private createEmptySnapshot(): MetricSnapshot {
    return {
      timestamp: new Date().toISOString(),
      connections: {
        drivers: 0,
        students: 0,
        total: 0
      },
      messages: {
        publishedPerSecond: 0,
        broadcastPerSecond: 0,
        totalBytes: 0,
        averageSize: 0
      },
      latency: {
        p50: 0,
        p95: 0,
        p99: 0
      },
      errors: {
        authFailures: 0,
        invalidWrites: 0,
        rateLimitRejects: 0,
        total: 0
      },
      resources: {
        memoryUsage: 0,
        cpuUsage: 0,
        networkBandwidth: 0
      },
      flags: {
        active: 0,
        acknowledged: 0,
        expired: 0,
        totalToday: 0
      }
    };
  }

  /**
   * Get current metrics snapshot
   */
  public getSnapshot(): MetricSnapshot {
    return { ...this.metrics };
  }

  /**
   * Export metrics for analysis
   */
  public exportMetrics(): string {
    return JSON.stringify(this.metrics, null, 2);
  }

  /**
   * Reset metrics
   */
  public reset(): void {
    this.metrics = this.createEmptySnapshot();
    this.messageTimestamps = [];
    this.errorTimestamps = [];
    this.latencyBuffer = [];
  }
}

interface Alert {
  level: 'warning' | 'error' | 'critical';
  type: string;
  message: string;
  value: number;
  threshold: number;
}

export default RealtimeMetricsService;
