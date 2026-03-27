import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { KycEvent, KycStatus } from './kyc.constants';

export interface KycNotificationPayload {
  userId: string;
  status: KycStatus.APPROVED | KycStatus.REJECTED;
  reason?: string;
  occurredAt: Date;
}

@Injectable()
export class KycNotificationService {
  private readonly logger = new Logger(KycNotificationService.name);

  constructor(private readonly eventEmitter: EventEmitter2) {}

  emitApproved(userId: string, reason?: string): void {
    const payload: KycNotificationPayload = {
      userId,
      status: KycStatus.APPROVED,
      reason,
      occurredAt: new Date(),
    };

    this.logger.log(`KYC approved for user ${userId}`);
    this.eventEmitter.emit(KycEvent.APPROVED, payload);
  }

  emitRejected(userId: string, reason?: string): void {
    const payload: KycNotificationPayload = {
      userId,
      status: KycStatus.REJECTED,
      reason,
      occurredAt: new Date(),
    };

    this.logger.warn(`KYC rejected for user ${userId}. Reason: ${reason ?? 'none provided'}`);
    this.eventEmitter.emit(KycEvent.REJECTED, payload);
  }
}
