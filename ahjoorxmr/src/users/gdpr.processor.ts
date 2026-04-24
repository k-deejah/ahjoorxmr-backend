import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectsCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { User } from './entities/user.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { Contribution } from '../contributions/entities/contribution.entity';
import { KycDocument } from '../kyc/entities/kyc-document.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notification/notification.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { MailService } from '../mail/mail.service';
import { GdprService } from './gdpr.service';
import { GDPR_QUEUE_NAME, GDPR_JOB_NAMES } from './gdpr.constants';

@Processor(GDPR_QUEUE_NAME)
export class GdprProcessor extends WorkerHost {
  private readonly logger = new Logger(GdprProcessor.name);
  private readonly s3: S3Client;
  private readonly bucket: string;
  private readonly expiryHours: number;

  constructor(
    @InjectRepository(User) private readonly userRepo: Repository<User>,
    @InjectRepository(Membership) private readonly membershipRepo: Repository<Membership>,
    @InjectRepository(Contribution) private readonly contributionRepo: Repository<Contribution>,
    @InjectRepository(KycDocument) private readonly kycDocRepo: Repository<KycDocument>,
    @InjectRepository(AuditLog) private readonly auditLogRepo: Repository<AuditLog>,
    @InjectRepository(Notification) private readonly notificationRepo: Repository<Notification>,
    @InjectRepository(RefreshToken) private readonly refreshTokenRepo: Repository<RefreshToken>,
    private readonly mailService: MailService,
    private readonly gdprService: GdprService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.s3 = new S3Client({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
    });
    this.bucket = this.configService.get<string>('GDPR_EXPORT_S3_BUCKET', 'gdpr-exports');
    this.expiryHours = this.configService.get<number>('DATA_EXPORT_LINK_TTL', 48);
  }

  async process(job: Job): Promise<void> {
    if (job.name === GDPR_JOB_NAMES.DATA_EXPORT) {
      await this.handleDataExport(job.data.userId);
    } else if (job.name === GDPR_JOB_NAMES.RIGHT_TO_ERASURE) {
      await this.handleErasure(job.data.userId);
    }
  }

  private async handleDataExport(userId: string): Promise<void> {
    const [user, memberships, contributions, kycDocs, auditLogs, notifications, sessions] =
      await Promise.all([
        this.userRepo.findOne({ where: { id: userId } }),
        this.membershipRepo.find({ where: { userId } }),
        this.contributionRepo.find({ where: { userId } }),
        this.kycDocRepo.find({ where: { userId } }),
        this.auditLogRepo.find({ where: { userId } }),
        this.notificationRepo.find({ where: { userId } }),
        this.refreshTokenRepo.find({ where: { userId } }),
      ]);

    // Strip sensitive fields from KYC docs (metadata only, not raw files)
    const kycMetadata = kycDocs.map(({ storageKey: _sk, url: _url, ...meta }) => meta);

    // Strip token hashes from sessions
    const sessionMetadata = sessions.map(({ tokenHash: _th, ...meta }) => meta);

    const exportData = JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        user: this.sanitizeUser(user),
        memberships,
        contributions,
        kycDocuments: kycMetadata,
        auditLogs,
        notifications,
        sessions: sessionMetadata,
      },
      null,
      2,
    );

    const key = `exports/${userId}/${Date.now()}.json`;
    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: exportData,
        ContentType: 'application/json',
      }),
    );

    const downloadUrl = await getSignedUrl(
      this.s3,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn: this.expiryHours * 3600 },
    );

    if (user?.email) {
      await this.mailService.send(
        'data-export-ready',
        {
          userName: user.firstName ?? user.email,
          downloadLink: downloadUrl,
          expiryTime: `${this.expiryHours} hours`,
        },
        { to: user.email, subject: 'Your data export is ready' },
      );
    }

    this.logger.log(`Data export completed for user ${userId}`);
  }

  private async handleErasure(userId: string): Promise<void> {
    // 1. Hard-delete KYC S3 objects
    const kycDocs = await this.kycDocRepo.find({ where: { userId } });
    if (kycDocs.length > 0) {
      const objects = kycDocs.map((d) => ({ Key: d.storageKey }));
      await this.s3.send(
        new DeleteObjectsCommand({ Bucket: this.bucket, Delete: { Objects: objects } }),
      );
      await this.kycDocRepo.delete({ userId });
    }

    // 2. Delete user export objects from S3
    const listed = await this.s3.send(
      new ListObjectsV2Command({ Bucket: this.bucket, Prefix: `exports/${userId}/` }),
    );
    if (listed.Contents && listed.Contents.length > 0) {
      await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: listed.Contents.map((o) => ({ Key: o.Key! })) },
        }),
      );
    }

    // 3. Revoke all refresh tokens
    await this.refreshTokenRepo.update(
      { userId },
      { revokedAt: new Date() },
    );

    // 4. Anonymize PII
    await this.gdprService.anonymizeUser(userId);

    // 5. Record erasure completion in audit log
    await this.auditLogRepo.save(
      this.auditLogRepo.create({
        userId,
        action: 'ERASURE_COMPLETED',
        resource: 'USER',
        metadata: { completedAt: new Date().toISOString() },
      }),
    );

    this.logger.log(`Erasure completed for user ${userId}`);
  }

  /** Remove sensitive fields before including in export. */
  private sanitizeUser(user: User | null): Partial<User> | null {
    if (!user) return null;
    const { password, twoFactorSecret, backupCodes, refreshTokenHash, ...safe } = user as any;
    return safe;
  }
}
