import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisModule } from './common/redis/redis.module';
import { CacheInterceptor } from './common/interceptors/cache.interceptor';
import { HealthModule } from './health/health.module';
import { AuthModule } from './auth/auth.module';
import { StellarAuthModule } from './stellar-auth/auth.module';
import { UsersModule } from './users/users.module';
import { GroupsModule } from './groups/groups.module';
import { MembershipsModule } from './memberships/memberships.module';
import { ContributionsModule } from './contributions/contributions.module';
import { RedisModule } from './common/redis/redis.module';
import { SchedulerModule } from './scheduler/scheduler.module';
import { Membership } from './memberships/entities/membership.entity';
import { Group } from './groups/entities/group.entity';
import { User } from './users/entities/user.entity';
import { Contribution } from './contributions/entities/contribution.entity';
import { AuditLog } from './audit/entities/audit-log.entity';
import { StellarModule } from './stellar/stellar.module';
import { EventListenerModule } from './event-listener/event-listener.module';
import { CustomThrottlerModule } from './throttler/throttler.module';
import { AuditModule } from './audit/audit.module';
import { SeedModule } from './database/seeds/seed.module';

@Module({
  imports: [
    // ConfigModule must be first to make environment variables available
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),

    // TypeORM configuration with PostgreSQL
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const isDevelopment =
          configService.get<string>('NODE_ENV') === 'development';
        return {
          type: 'postgres',
          host: configService.get<string>('DB_HOST') || 'localhost',
          port: parseInt(configService.get<string>('DB_PORT') || '5432', 10),
          username: configService.get<string>('DB_USERNAME') || 'postgres',
          password: configService.get<string>('DB_PASSWORD') || 'postgres',
          database: configService.get<string>('DB_NAME') || 'ahjoorxmr',
          entities: [Membership, Group, User, Contribution, AuditLog],
          synchronize: isDevelopment, // Auto-create tables only in development
          logging: isDevelopment, // Enable logging only in development
        };
      },
      inject: [ConfigService],
    }),

    // RedisModule for caching and session management
    RedisModule,
    CustomThrottlerModule,
    SchedulerModule,
    HealthModule,
    AuthModule,
    StellarAuthModule,
    UsersModule,
    GroupsModule,
    MembershipsModule,
    ContributionsModule,
    StellarModule,
    EventListenerModule,
    AuditModule,
    SeedModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_INTERCEPTOR,
      useClass: CacheInterceptor,
    },
  ],
})
export class AppModule {}
