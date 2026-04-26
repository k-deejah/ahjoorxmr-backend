import { NestFactory, Reflector } from '@nestjs/core';
import { ClassSerializerInterceptor, ValidationPipe, VersioningType } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ApiVersionDeprecationInterceptor } from './common/interceptors/api-version-deprecation.interceptor';
import { DeprecationInterceptor } from './common/interceptors/deprecation.interceptor';
import { WinstonLogger } from './common/logger/winston.logger';
import { RateLimitHeadersInterceptor } from './throttler/interceptors/rate-limit-headers.interceptor';
import { initializeTracing } from './common/tracing/tracing';

async function bootstrap() {
  initializeTracing();
  const app = await NestFactory.create(AppModule, {
    logger: new WinstonLogger(),
    rawBody: true, // Required for HMAC webhook signature validation
  });

  // Enable graceful shutdown hooks for SIGTERM and SIGINT
  app.enableShutdownHooks();

  // Get Reflector for interceptors
  const reflector = app.get(Reflector);

  // Enable API versioning
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
    prefix: 'api/v',
  });

  // Global pipes
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Note: CustomThrottlerGuard is now registered as APP_GUARD in CustomThrottlerModule
  // No need to manually instantiate it here

  // Global filters
  app.useGlobalFilters(new HttpExceptionFilter());

  // Global interceptors
  const configService = app.get(ConfigService);
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    new ClassSerializerInterceptor(reflector),
    new RateLimitHeadersInterceptor(reflector),
    new ApiVersionDeprecationInterceptor(reflector),
    new DeprecationInterceptor(reflector, configService),
  );

  // CORS — use CORS_ALLOWED_ORIGINS (comma-separated) instead of single CORS_ORIGIN
  const allowedOrigins = (configService.get<string>('CORS_ALLOWED_ORIGINS') ?? '')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);
  const allowCredentials = configService.get<string>('CORS_ALLOW_CREDENTIALS') === 'true';

  app.enableCors({
    origin: allowedOrigins.length ? allowedOrigins : false,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: allowCredentials,
    allowedHeaders: ['Content-Type', 'Authorization', 'Idempotency-Key', 'X-Correlation-ID'],
  });

  // Helmet — explicit OWASP-recommended security headers
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'"],
          imgSrc: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      referrerPolicy: { policy: 'strict-origin' },
      noSniff: true, // X-Content-Type-Options: nosniff
      frameguard: { action: 'deny' },
      hsts: isProduction
        ? { maxAge: 63072000, includeSubDomains: true, preload: true }
        : false,
      permittedCrossDomainPolicies: false,
    }),
  );

  // Permissions-Policy header (not yet in Helmet 8)
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('Permissions-Policy', 'geolocation=()');
    next();
  });

  // Setup Swagger documentation
  const isSwaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    process.env.SWAGGER_ENABLED === 'true';

  if (isSwaggerEnabled) {
    // V1 API Documentation (Deprecated)
    const configV1 = new DocumentBuilder()
      .setTitle('Ahjoor Backend API v1 (Deprecated)')
      .setDescription(
        'Version 1 of the Ahjoor Backend API (DEPRECATED). ' +
          'This API provides endpoints for user authentication, ROSCA group management, ' +
          'membership tracking, contribution processing, and more. ' +
          'Please migrate to v2 for new integrations. ' +
          'Breaking changes in v2: GET /api/v2/groups/:id no longer includes members; ' +
          'use GET /api/v2/groups/:id/members instead.',
      )
      .setVersion('1.0.0')
      .setContact('Ahjoor Team', 'https://ahjoor.com', 'support@ahjoor.com')
      .setLicense('UNLICENSED', '')
      .addServer('http://localhost:3000', 'Local Development Server')
      .addServer('https://api.ahjoor.com', 'Production Server')
      .addTag(
        'Authentication',
        'User authentication and authorization endpoints',
      )
      .addTag('Users', 'User management endpoints')
      .addTag('Groups', 'ROSCA group management endpoints (DEPRECATED)')
      .addTag('Memberships', 'Group membership management endpoints')
      .addTag('Contributions', 'Contribution tracking endpoints')
      .addTag('Audit', 'Audit log and monitoring endpoints')
      .addTag('Health', 'Health check and status endpoints')
      .addTag('Rate Limiting', 'Rate limiting configuration and management')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const documentV1 = SwaggerModule.createDocument(app, configV1, {
      include: [], // Include all modules for now
      operationIdFactory: (controllerKey: string, methodKey: string) =>
        `${controllerKey}_${methodKey}`,
    });

    SwaggerModule.setup('api/docs/v1', app, documentV1, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        showRequestDuration: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: 'Ahjoor API Documentation - v1 (Deprecated)',
    });

    // V2 API Documentation (Current)
    const configV2 = new DocumentBuilder()
      .setTitle('Ahjoor Backend API v2')
      .setDescription(
        'Version 2 of the Ahjoor Backend API (Current). ' +
          'This API provides endpoints for user authentication, ROSCA group management, ' +
          'membership tracking, contribution processing, and more. ' +
          'Breaking changes from v1: GET /api/v2/groups/:id no longer includes members; ' +
          'use GET /api/v2/groups/:id/members for member data.',
      )
      .setVersion('2.0.0')
      .setContact('Ahjoor Team', 'https://ahjoor.com', 'support@ahjoor.com')
      .setLicense('UNLICENSED', '')
      .addServer('http://localhost:3000', 'Local Development Server')
      .addServer('https://api.ahjoor.com', 'Production Server')
      .addTag(
        'Authentication',
        'User authentication and authorization endpoints',
      )
      .addTag('Users', 'User management endpoints')
      .addTag('Groups V2', 'ROSCA group management endpoints (v2)')
      .addTag('Memberships', 'Group membership management endpoints')
      .addTag('Contributions', 'Contribution tracking endpoints')
      .addTag('Audit', 'Audit log and monitoring endpoints')
      .addTag('Health', 'Health check and status endpoints')
      .addTag('Rate Limiting', 'Rate limiting configuration and management')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          name: 'JWT',
          description: 'Enter JWT token',
          in: 'header',
        },
        'JWT-auth',
      )
      .build();

    const documentV2 = SwaggerModule.createDocument(app, configV2, {
      include: [], // Include all modules for now
      operationIdFactory: (controllerKey: string, methodKey: string) =>
        `${controllerKey}_${methodKey}`,
    });

    SwaggerModule.setup('api/docs/v2', app, documentV2, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        showRequestDuration: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: 'Ahjoor API Documentation - v2',
    });

    // Main API docs redirect to v2 (current version)
    SwaggerModule.setup('api/docs', app, documentV2, {
      swaggerOptions: {
        persistAuthorization: true,
        docExpansion: 'list',
        filter: true,
        showRequestDuration: true,
        tryItOutEnabled: true,
      },
      customSiteTitle: 'Ahjoor API Documentation',
    });

    console.log(
      `Swagger documentation available at:\n` +
        `  - v1 (deprecated): http://localhost:${process.env.PORT ?? 3000}/api/docs/v1\n` +
        `  - v2 (current): http://localhost:${process.env.PORT ?? 3000}/api/docs/v2\n` +
        `  - default: http://localhost:${process.env.PORT ?? 3000}/api/docs`,
    );
  }

  const port = process.env.PORT ?? 3000;
  await app.listen(port);

  console.log(`Application is running on: http://localhost:${port}`);

  // Setup graceful shutdown with timeout
  const shutdownTimeoutMs = parseInt(
    process.env.SHUTDOWN_TIMEOUT_MS || '15000',
    10,
  );

  const gracefulShutdown = async (signal: string) => {
    console.log(
      `\n[${new Date().toISOString()}] Received ${signal}, starting graceful shutdown...`,
    );

    const shutdownTimer = setTimeout(() => {
      console.error(
        `[${new Date().toISOString()}] Graceful shutdown timeout (${shutdownTimeoutMs}ms) exceeded, forcing exit`,
      );
      process.exit(1);
    }, shutdownTimeoutMs);

    try {
      await app.close();
      clearTimeout(shutdownTimer);
      console.log(
        `[${new Date().toISOString()}] Application closed successfully`,
      );
      process.exit(0);
    } catch (error) {
      clearTimeout(shutdownTimer);
      console.error(
        `[${new Date().toISOString()}] Error during shutdown:`,
        error,
      );
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
}
void bootstrap();
