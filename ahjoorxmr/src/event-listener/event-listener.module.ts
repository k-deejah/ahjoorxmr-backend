import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { RedisModule } from '@nestjs-modules/ioredis';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventListenerService } from './event-listener.service';
import { EventListenerController } from './event-listener.controller';
import { Contribution } from '../contributions/entities/contribution.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { Group } from '../groups/entities/group.entity';
import { WinstonLogger } from '../common/logger/winston.logger';

@Module({
  imports: [
    ConfigModule,
    ScheduleModule.forRoot(),
    RedisModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        type: 'single',
        options: {
          host: configService.get<string>('REDIS_HOST', '127.0.0.1'),
          port: parseInt(configService.get<string>('REDIS_PORT', '6379'), 10),
          password: configService.get<string>('REDIS_PASSWORD') || undefined,
          db: parseInt(configService.get<string>('REDIS_DB', '0'), 10),
        },
      }),
    }),
    TypeOrmModule.forFeature([Contribution, Membership, Group]),
  ],
  controllers: [EventListenerController],
  providers: [EventListenerService, WinstonLogger],
  exports: [EventListenerService],
})
export class EventListenerModule {}
