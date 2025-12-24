import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { DRIZZLE } from '../database/drizzle.provider';
import { sql } from 'drizzle-orm';
import type { DrizzleDB } from '../common/types';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  environment: string;
  checks: {
    database: HealthCheck;
    memory: HealthCheck;
    disk?: HealthCheck;
  };
}

interface HealthCheck {
  status: 'pass' | 'fail' | 'warn';
  message?: string;
  duration?: number;
  details?: Record<string, unknown>;
}

@ApiTags('Health')
@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(@Inject(DRIZZLE) private db: DrizzleDB) {}

  @Get()
  @ApiOperation({ summary: 'Basic health check' })
  @ApiResponse({ status: 200, description: 'Service is healthy' })
  async healthCheck(): Promise<HealthStatus> {
    const startTime = Date.now();

    // Check database
    const dbCheck = await this.checkDatabase();

    // Check memory
    const memoryCheck = this.checkMemory();

    // Determine overall status
    const checks = { database: dbCheck, memory: memoryCheck };
    const overallStatus = this.determineOverallStatus(checks);

    return {
      status: overallStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0',
      environment: process.env.NODE_ENV || 'development',
      checks,
    };
  }

  @Get('live')
  @ApiOperation({ summary: 'Liveness probe' })
  @ApiResponse({ status: 200, description: 'Service is alive' })
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  @Get('ready')
  @ApiOperation({ summary: 'Readiness probe' })
  @ApiResponse({ status: 200, description: 'Service is ready' })
  async readiness(): Promise<{ status: string; ready: boolean }> {
    try {
      // Quick database ping
      await this.db.execute(sql`SELECT 1`);
      return { status: 'ok', ready: true };
    } catch {
      return { status: 'error', ready: false };
    }
  }

  @Get('detailed')
  @ApiOperation({ summary: 'Detailed health check with metrics' })
  @ApiResponse({ status: 200, description: 'Detailed health status' })
  async detailedHealth(): Promise<any> {
    const health = await this.healthCheck();
    const memoryUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      ...health,
      metrics: {
        memory: {
          rss: this.formatBytes(memoryUsage.rss),
          heapTotal: this.formatBytes(memoryUsage.heapTotal),
          heapUsed: this.formatBytes(memoryUsage.heapUsed),
          external: this.formatBytes(memoryUsage.external),
          arrayBuffers: this.formatBytes(memoryUsage.arrayBuffers),
        },
        cpu: {
          user: cpuUsage.user,
          system: cpuUsage.system,
        },
        process: {
          pid: process.pid,
          platform: process.platform,
          nodeVersion: process.version,
          uptime: this.formatUptime(process.uptime()),
        },
      },
    };
  }

  private async checkDatabase(): Promise<HealthCheck> {
    const startTime = Date.now();
    try {
      await this.db.execute(sql`SELECT 1`);
      return {
        status: 'pass',
        message: 'Database connection is healthy',
        duration: Date.now() - startTime,
      };
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return {
        status: 'fail',
        message: `Database connection failed: ${errorMessage}`,
        duration: Date.now() - startTime,
      };
    }
  }

  private checkMemory(): HealthCheck {
    const memoryUsage = process.memoryUsage();
    const heapUsedPercentage =
      (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

    // Warn if heap usage is above 80%
    if (heapUsedPercentage > 80) {
      return {
        status: 'warn',
        message: `High memory usage: ${heapUsedPercentage.toFixed(1)}%`,
        details: {
          heapUsed: this.formatBytes(memoryUsage.heapUsed),
          heapTotal: this.formatBytes(memoryUsage.heapTotal),
          percentage: heapUsedPercentage.toFixed(1),
        },
      };
    }

    return {
      status: 'pass',
      message: 'Memory usage is normal',
      details: {
        heapUsed: this.formatBytes(memoryUsage.heapUsed),
        heapTotal: this.formatBytes(memoryUsage.heapTotal),
        percentage: heapUsedPercentage.toFixed(1),
      },
    };
  }

  private determineOverallStatus(
    checks: Record<string, HealthCheck>,
  ): 'healthy' | 'degraded' | 'unhealthy' {
    const statuses = Object.values(checks).map((c) => c.status);

    if (statuses.includes('fail')) {
      return 'unhealthy';
    }
    if (statuses.includes('warn')) {
      return 'degraded';
    }
    return 'healthy';
  }

  private formatBytes(bytes: number): string {
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let value = bytes;

    while (value >= 1024 && unitIndex < units.length - 1) {
      value /= 1024;
      unitIndex++;
    }

    return `${value.toFixed(2)} ${units[unitIndex]}`;
  }

  private formatUptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor((seconds % 86400) / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);

    const parts: string[] = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    parts.push(`${secs}s`);

    return parts.join(' ');
  }
}
