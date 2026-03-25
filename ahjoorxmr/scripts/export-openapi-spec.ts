import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';
import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';

/**
 * Export OpenAPI specification in JSON and YAML formats.
 * 
 * Usage:
 *   npm run export:spec
 * 
 * Outputs:
 *   - openapi.json - OpenAPI specification in JSON format
 *   - openapi.yaml - OpenAPI specification in YAML format
 */
async function exportOpenApiSpec() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Ahjoor Backend API')
    .setDescription('A comprehensive backend API for the Ahjoor application')
    .setVersion('0.0.1')
    .setContact(
      'Ahjoor Team',
      'https://ahjoor.com',
      'support@ahjoor.com',
    )
    .setLicense('UNLICENSED', '')
    .addServer('http://localhost:3000', 'Local Development Server')
    .addServer('https://api.ahjoor.com', 'Production Server')
    .addTag('Authentication', 'User authentication and authorization endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('Groups', 'ROSCA group management endpoints')
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

  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => 
      `${controllerKey}_${methodKey}`,
  });

  // Export JSON format
  const jsonOutputPath = path.resolve(process.cwd(), 'openapi.json');
  fs.writeFileSync(jsonOutputPath, JSON.stringify(document, null, 2));
  
  // Export YAML format
  const yamlOutputPath = path.resolve(process.cwd(), 'openapi.yaml');
  const yamlDocument = yaml.dump(document, {
    indent: 2,
    lineWidth: -1,
    noRefs: true,
  });
  fs.writeFileSync(yamlOutputPath, yamlDocument);

  console.log('✅ OpenAPI specification exported successfully!');
  console.log('');
  console.log(`📄 JSON: ${jsonOutputPath}`);
  console.log(`📄 YAML: ${yamlOutputPath}`);
  console.log('');
  console.log(`📊 API Title: ${document.info.title}`);
  console.log(`📊 API Version: ${document.info.version}`);
  console.log(`📊 Total Paths: ${Object.keys(document.paths).length}`);
  console.log(`📊 Total Tags: ${document.tags?.length || 0}`);
  
  await app.close();
  process.exit(0);
}

exportOpenApiSpec().catch((error) => {
  console.error('❌ Failed to export OpenAPI specification:', error);
  process.exit(1);
});