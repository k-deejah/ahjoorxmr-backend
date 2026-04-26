import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { KycDocument } from './entities/kyc-document.entity';
import { AuditLog } from './entities/audit-log.entity';
import { KycStatus } from './enums/kyc-status.enum';
import { KycProviderFactory } from './providers/kyc-provider.factory';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/enums/notification-type.enum';
import { ConfigService } from '@nestjs/config';
import { KycProvider } from './enums/kyc-provider.enum';

@Injectable()
export class KycWebhookService {
  private readonly logger = new Logger(KycWebhookService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(KycDocument)
    private readonly kycDocRepo: Repository<KycDocument>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepo: Repository<AuditLog>,
    private readonly providerFactory: KycProviderFactory,
    private readonly notificationsService: NotificationsService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Process a raw webhook body. Parses the payload, updates User.kycStatus,
   * writes an AuditLog entry, and sends an email when appropriate.
   */
  async processWebhook(rawBody: Buffer): Promise<void> {
    const parser = this.providerFactory.getParser();
    const parsed = parser.parse(rawBody);

    const { userId, providerReferenceId, status, raw } = parsed;

    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) {
      this.logger.warn(`KYC webhook for unknown userId=${userId}`);
      throw new NotFoundException(`User ${userId} not found`);
    }

    const previousStatus = user.kycStatus;

    // Update user KYC status
    user.kycStatus = status;
    await this.userRepo.save(user);

    // Upsert KycDocument record
    const provider = this.config.get<string>('KYC_PROVIDER', KycProvider.PERSONA) as KycProvider;
    let doc = await this.kycDocRepo.findOne({ where: { userId, providerReferenceId } });
    if (!doc) {
      doc = this.kycDocRepo.create({ userId, provider, providerReferenceId });
    }
    doc.status = status;
    doc.providerPayload = raw;
    await this.kycDocRepo.save(doc);

    // Emit audit log
    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        userId,
        eventType: 'KYC_STATUS_UPDATED',
        metadata: {
          previousStatus,
          newStatus: status,
          providerReferenceId,
          provider,
        },
      }),
    );

    this.logger.log(
      `KYC status updated userId=${userId} ${previousStatus} → ${status} ref=${providerReferenceId}`,
    );

    // Send email notification on terminal statuses
    if (status === KycStatus.APPROVED || status === KycStatus.DECLINED) {
      await this.sendKycEmail(user, status);
    }
  }

  // ─── Private ─────────────────────────────────────────────────────────────

  private async sendKycEmail(user: User, status: KycStatus): Promise<void> {
    if (!user.email) {
      this.logger.debug(`No email for userId=${user.id}, skipping KYC email`);
      return;
    }

    const isApproved = status === KycStatus.APPROVED;
    const type = isApproved
      ? NotificationType.KYC_APPROVED
      : NotificationType.KYC_DECLINED;

    const title = isApproved
      ? 'Your identity has been verified'
      : 'Identity verification unsuccessful';

    const body = isApproved
      ? 'Congratulations! Your KYC verification was approved. You now have full access to the platform.'
      : 'Unfortunately your KYC verification was declined. Please re-submit your documents or contact support for assistance.';

    await this.notificationsService.notify({
      userId: user.id,
      type,
      title,
      body,
      sendEmail: true,
      emailTo: user.email,
      emailTemplateData: { status },
    });
  }
}
