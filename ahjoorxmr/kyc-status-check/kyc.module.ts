import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { KycAdminController } from './kyc-admin.controller';
import { KycService } from './kyc.service';
import { KycGuard } from './kyc.guard';
import { KycNotificationService } from './kyc-notification.service';

/**
 * KycModule
 *
 * Provides:
 *  - KycGuard         — import in any module that needs it, or register globally
 *  - KycService       — admin approve/reject logic
 *  - KycAdminController — PATCH /admin/users/:id/kyc
 *  - KycNotificationService — event emission on status change
 *
 * Usage in another module (e.g. GroupsModule):
 *
 *   import { KycModule } from '../kyc/kyc.module';
 *   import { KycGuard }  from '../kyc/kyc.guard';
 *
 *   @Module({ imports: [KycModule], ... })
 *   export class GroupsModule {}
 *
 *   // In the controller:
 *   @UseGuards(JwtAuthGuard, KycGuard)
 *   @Post()
 *   createGroup(...) { ... }
 *
 * Replace 'User' string token with your actual TypeORM entity class.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([
      // Replace with your actual User entity:
      // User
      // Using string token here so this module compiles without the entity import
    ]),
    // EventEmitterModule should be registered once in AppModule.
    // Remove the line below if it is already registered globally.
    EventEmitterModule.forRoot(),
  ],
  controllers: [KycAdminController],
  providers: [KycService, KycGuard, KycNotificationService],
  exports: [KycService, KycGuard, KycNotificationService],
})
export class KycModule {}
