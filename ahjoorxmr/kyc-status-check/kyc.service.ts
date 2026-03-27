import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KycStatus } from './kyc.constants';
import { KycActionPayload, KycStatusResponseDto, UpdateKycStatusDto } from './kyc.dto';
import { KycNotificationService } from './kyc-notification.service';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository('User')
    private readonly userRepository: Repository<any>,
    private readonly notificationService: KycNotificationService,
  ) {}

  /**
   * Admin: approve or reject a user's KYC.
   * Only users with status PENDING (or NONE for edge cases) may be reviewed.
   */
  async updateKycStatus(
    targetUserId: string,
    dto: UpdateKycStatusDto,
    adminId: string,
  ): Promise<KycStatusResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: targetUserId },
    });

    if (!user) {
      throw new NotFoundException(`User ${targetUserId} not found`);
    }

    if (user.kycStatus === dto.status) {
      throw new BadRequestException(
        `User KYC status is already ${dto.status}`,
      );
    }

    const previousStatus: KycStatus = user.kycStatus;

    await this.userRepository.update(targetUserId, {
      kycStatus: dto.status,
      kycReason: dto.reason ?? null,
      kycReviewedAt: new Date(),
      kycReviewedBy: adminId,
    });

    this.logger.log(
      `Admin ${adminId} changed KYC for user ${targetUserId}: ` +
        `${previousStatus} → ${dto.status}`,
    );

    // Fire-and-forget notification events
    if (dto.status === KycStatus.APPROVED) {
      this.notificationService.emitApproved(targetUserId, dto.reason);
    } else {
      this.notificationService.emitRejected(targetUserId, dto.reason);
    }

    return {
      userId: targetUserId,
      kycStatus: dto.status,
      reason: dto.reason,
      updatedAt: new Date(),
    };
  }

  /**
   * Read a user's current KYC status (admin or internal use).
   */
  async getKycStatus(userId: string): Promise<KycStatusResponseDto> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'kycStatus', 'kycReason', 'kycReviewedAt'],
    });

    if (!user) {
      throw new NotFoundException(`User ${userId} not found`);
    }

    return {
      userId: user.id,
      kycStatus: user.kycStatus,
      reason: user.kycReason,
      updatedAt: user.kycReviewedAt,
    };
  }
}
