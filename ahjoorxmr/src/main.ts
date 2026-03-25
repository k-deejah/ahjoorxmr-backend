import { NestFactory, Reflector } from '@nestjs/core';
import { ValidationPipe, VersioningType } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggingInterceptor } from './common/interceptors/logging.interceptor';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';
import { ApiVersionDeprecationInterceptor } from './common/interceptors/api-version-deprecation.interceptor';
import { WinstonLogger } from './common/logger/winston.logger';
import { RateLimitHeadersInterceptor } from './throttler/interceptors/rate-limit-headers.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    logger: new WinstonLogger(),
  });

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
  app.useGlobalInterceptors(
    new LoggingInterceptor(),
    new TransformInterceptor(),
    new RateLimitHeadersInterceptor(reflector),
    new ApiVersionDeprecationInterceptor(reflector),
  );

  // Enable CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || '*',
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    credentials: true,
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
}
void bootstrap();
