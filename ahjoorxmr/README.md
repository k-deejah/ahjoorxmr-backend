<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ npm install
```

## Compile and run the project

```bash
# development
$ npm run start

# watch mode
$ npm run start:dev

# production mode
$ npm run start:prod
```

## Run tests

```bash
# unit tests
$ npm run test

# e2e tests
$ npm run test:e2e

# test coverage
$ npm run test:cov
```

## Database Migrations

This project uses TypeORM migrations to manage database schema changes in a controlled, reproducible way. Migrations are stored in the `migrations/` directory and tracked in version control.

### Why Migrations?

- **Production Safety**: Never use `synchronize: true` in production as it can cause data loss
- **Version Control**: Schema changes are tracked alongside code changes
- **Reproducibility**: Apply the same schema changes across all environments
- **Rollback Support**: Revert problematic changes safely

### Migration Commands

```bash
# Generate a new migration from entity changes
$ npm run migration:generate migrations/DescriptiveName

# Run all pending migrations
$ npm run migration:run

# Revert the last applied migration
$ npm run migration:revert
```

### Workflow

1. **Make changes to your entities** (e.g., add a new column to `User`)
2. **Generate a migration**: `npm run migration:generate migrations/AddEmailToUser`
3. **Review the generated migration** in the `migrations/` directory
4. **Run the migration**: `npm run migration:run`
5. **Commit both the entity changes and migration file** to version control

### Configuration

- **typeorm.config.ts**: DataSource configuration for the TypeORM CLI
- **migrations/**: Directory containing all migration files
- **database.sqlite**: File-based SQLite database (for development)

### Important Notes

- Always review generated migrations before running them
- Test migrations in a development environment first
- Keep migrations small and focused on a single change
- Never modify a migration that has been run in production
- Use descriptive names for migrations (e.g., `AddUserEmailColumn`, `CreateOrdersTable`)

## API Versioning

This API uses **URI-based versioning** to manage breaking changes and ensure backward compatibility. All endpoints are versioned using the `/api/v{version}/` prefix.

### Version Strategy

- **Current Version**: `v1`
- **Base URL Pattern**: `/api/v{version}/{resource}`
- **Example**: `/api/v1/users`, `/api/v1/groups`, `/api/v1/auth`

### Versioning Implementation

The API uses NestJS's built-in versioning system with the following configuration:

```typescript
app.enableVersioning({
  type: VersioningType.URI,
  defaultVersion: '1',
  prefix: 'api/v',
});
```

### How It Works

1. **All endpoints are versioned by default**: Controllers use the `@Version()` decorator
2. **Multiple versions can coexist**: Different versions can run simultaneously
3. **Deprecation warnings**: Deprecated versions return special headers
4. **Version-specific documentation**: Swagger docs are separated by version

### HTTP Headers

#### Deprecation Headers

When using a deprecated API version, the following headers are returned:

```
X-API-Deprecated: true
X-API-Deprecation-Info: This API version is deprecated. Please migrate to the latest version.
X-API-Sunset-Date: 2027-12-31
```

### Accessing Different Versions

To access different API versions, simply change the version number in the URL:

```bash
# Version 1 (current)
GET /api/v1/users

# Future version 2
GET /api/v2/users
```

### Creating New Versions

When introducing breaking changes:

1. **Create version-specific controllers** (if needed):

   ```typescript
   @Controller('users')
   @Version('2')
   export class UsersV2Controller { ... }
   ```

2. **Create version-specific DTOs** (if needed):

   ```
   dto/
     v1/
       user.dto.ts
     v2/
       user.dto.ts
   ```

3. **Update Swagger configuration** in `main.ts` to include the new version

4. **Mark old versions as deprecated**:
   ```typescript
   @Controller('users')
   @Version('1')
   @SetMetadata('deprecated', true)
   export class UsersController { ... }
   ```

### Best Practices

- **Maintain backward compatibility** within a major version
- **Document all breaking changes** in version release notes
- **Plan deprecation timelines** before removing old versions
- **Test all versions** independently in your test suite
- **Use semantic versioning principles** for planning version increments

### Special Endpoints

Some endpoints are **not versioned** as they serve infrastructure purposes:

- `/health` - Health check endpoint
- `/api/docs` - Swagger documentation (defaults to latest version)
- `/api/docs/v1` - Version-specific Swagger documentation

### API Documentation

Swagger documentation is available for each version:

- **Main docs** (latest): `http://localhost:3000/api/docs`
- **Version 1**: `http://localhost:3000/api/docs/v1`
- **Version 2** (when available): `http://localhost:3000/api/docs/v2`

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ npm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
