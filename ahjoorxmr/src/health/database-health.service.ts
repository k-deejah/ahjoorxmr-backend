import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

/**
 * Database health service for monitoring database connectivity and performance
 */
@Injectable()
export class DatabaseHealthService {
  private readonly logger = new Logger(DatabaseHealthService.name);

  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  /**
   * Check if database is connected and responsive
   */
  async isDatabaseHealthy(): Promise<{
    isHealthy: boolean;
    responseTime: number;
    details?: any;
  }> {
    const startTime = Date.now();

    try {
      // Simple query to check database responsiveness
      await this.dataSource.query('SELECT 1');

      const responseTime = Date.now() - startTime;

      return {
        isHealthy: true,
        responseTime,
        details: {
          type: this.dataSource.options.type,
          database: (this.dataSource.options as any).database,
          isConnected: this.dataSource.isInitialized,
        },
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error('Database health check failed', error);
      return {
        isHealthy: false,
        responseTime: Date.now() - startTime,
        details: {
          error: errorMessage,
        },
      };
    }
  }

  /**
   * Get database connection pool statistics
   */
  async getPoolStats(): Promise<any> {
    try {
      if (!this.dataSource.driver) {
        return null;
      }

      // Get pool statistics from the driver
      const driver = this.dataSource.driver as any;

      if (driver.master && driver.master.pool) {
        const pool = driver.master.pool;
        return {
          totalConnections: pool.totalCount || 0,
          idleConnections: pool.idleCount || 0,
          activeConnections: (pool.totalCount || 0) - (pool.idleCount || 0),
          waitingRequests: pool.waitingCount || 0,
        };
      }

      return null;
    } catch (error) {
      this.logger.error('Failed to get pool stats', error);
      return null;
    }
  }

  /**
   * Get database size and table statistics
   */
  async getDatabaseStats(): Promise<any> {
    try {
      const database = (this.dataSource.options as any).database;

      // Get database size
      const sizeResult = await this.dataSource.query(
        `SELECT pg_size_pretty(pg_database_size($1)) as size`,
        [database],
      );

      // Get table statistics
      const tablesResult = await this.dataSource.query(`
        SELECT 
          schemaname as schema,
          tablename as table_name,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
          n_live_tup as row_count
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
        LIMIT 10
      `);

      return {
        databaseSize: sizeResult[0]?.size,
        tables: tablesResult,
      };
    } catch (error) {
      this.logger.error('Failed to get database stats', error);
      return null;
    }
  }

  /**
   * Check for slow queries
   */
  async checkSlowQueries(thresholdMs: number = 1000): Promise<any[]> {
    try {
      const result = await this.dataSource.query(
        `
        SELECT 
          pid,
          now() - query_start as duration,
          query,
          state
        FROM pg_stat_activity
        WHERE state != 'idle'
          AND now() - query_start > interval '${thresholdMs} milliseconds'
        ORDER BY duration DESC
        LIMIT 10
      `,
      );

      return result;
    } catch (error) {
      this.logger.error('Failed to check slow queries', error);
      return [];
    }
  }

  /**
   * Test database write operations
   */
  async testWrite(): Promise<boolean> {
    try {
      await this.dataSource.query(`
        CREATE TEMP TABLE IF NOT EXISTS health_check (
          id SERIAL PRIMARY KEY,
          timestamp TIMESTAMP DEFAULT NOW()
        )
      `);

      await this.dataSource.query(`
        INSERT INTO health_check DEFAULT VALUES
      `);

      await this.dataSource.query(`
        DROP TABLE IF EXISTS health_check
      `);

      return true;
    } catch (error) {
      this.logger.error('Write test failed', error);
      return false;
    }
  }

  /**
   * Get comprehensive health report
   */
  async getHealthReport(): Promise<{
    database: any;
    pool?: any;
    stats?: any;
    canWrite: boolean;
  }> {
    const [database, pool, stats, canWrite] = await Promise.all([
      this.isDatabaseHealthy(),
      this.getPoolStats(),
      this.getDatabaseStats(),
      this.testWrite(),
    ]);

    return {
      database,
      pool,
      stats,
      canWrite,
    };
  }
}
