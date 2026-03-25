import { registerAs } from '@nestjs/config';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';
import { DataSourceOptions } from 'typeorm';

/**
 * Database configuration for TypeORM
 * Supports PostgreSQL with connection pooling
 */
export default registerAs(
  'database',
  (): TypeOrmModuleOptions & DataSourceOptions => {
    const isProduction = process.env.NODE_ENV === 'production';
    const isDevelopment = process.env.NODE_ENV === 'development';

    return {
      type: 'postgres',
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'postgres',
      database: process.env.DB_NAME || 'ahjoorxmr',

      // Entity auto-loading
      entities: [__dirname + '/../**/*.entity{.ts,.js}'],

      // Migrations configuration
      migrations: [__dirname + '/../../migrations/*{.ts,.js}'],
      migrationsRun: process.env.RUN_MIGRATIONS === 'true',
      migrationsTableName: 'migrations_history',

      // Synchronize (only in development - NEVER in production)
      synchronize: isDevelopment && process.env.DB_SYNCHRONIZE !== 'false',

      // Logging
      logging: isDevelopment ? ['query', 'error', 'warn'] : ['error'],
      logger: 'advanced-console',

      // Connection pooling
      extra: {
        // Maximum number of clients in the pool
        max: parseInt(process.env.DB_POOL_MAX || '20', 10),

        // Minimum number of clients in the pool
        min: parseInt(process.env.DB_POOL_MIN || '2', 10),

        // Maximum time (ms) a client can be idle before being released
        idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),

        // Maximum time (ms) to wait for connection from pool
        connectionTimeoutMillis: parseInt(
          process.env.DB_CONNECTION_TIMEOUT || '2000',
          10,
        ),

        // Enable SSL for production
        ssl:
          isProduction && process.env.DB_SSL !== 'false'
            ? {
                rejectUnauthorized:
                  process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
              }
            : false,
      },

      // Retry connection
      retryAttempts: parseInt(process.env.DB_RETRY_ATTEMPTS || '10', 10),
      retryDelay: parseInt(process.env.DB_RETRY_DELAY || '3000', 10),

      // Auto-load entities
      autoLoadEntities: true,

      // Cache
      cache:
        process.env.DB_CACHE_ENABLED === 'true'
          ? {
              type: 'redis',
              options: {
                host: process.env.REDIS_HOST || 'localhost',
                port: parseInt(process.env.REDIS_PORT || '6379', 10),
                password: process.env.REDIS_PASSWORD,
              },
              duration: parseInt(process.env.DB_CACHE_DURATION || '60000', 10), // 60 seconds
            }
          : false,
    };
  },
);
