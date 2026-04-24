import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { S3Client, PutObjectCommand, DeleteObjectsCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { GetObjectCommand } from '@aws-sdk/client-s3';
import { User } from './entities/user.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { Contribution } from '../contributions/entities/contribution.entity';
import { KycDocument } from '../kyc/entities/kyc-document.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
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
    private readonly mailService: MailService,
    private readonly gdprService: GdprService,
    private readonly configService: ConfigService,
  ) {
    super();
    this.s3 = new S3Client({
      region: this.configService.get<string>('AWS_REGION', 'us-east-1'),
    });
    this.bucket = this.configService.get<string>('GDPR_EXPORT_S3_BUCKET', 'gdpr-exports');
    this.expiryHours = this.configService.get<number>('GDPR_EXPORT_EXPIRY_HOURS', 24);
  }

  async process(job: Job): Promise<void> {
    if (job.name === GDPR_JOB_NAMES.DATA_EXPORT) {
      await this.handleDataExport(job.data.userId);
    } else if (job.name === GDPR_JOB_NAMES.RIGHT_TO_ERASURE) {
      await this.handleErasure(job.data.userId);
    }
  }

  private async handleDataExport(userId: string): Promise<void> {
    const [user, memberships, contributions, kycDocs, auditLogs] = await Promise.all([
      this.userRepo.findOne({ where: { id: userId } }),
      this.membershipRepo.find({ where: { userId } }),
      this.contributionRepo.find({ where: { userId } }),
      this.kycDocRepo.find({ where: { userId } }),
      this.auditLogRepo.find({ where: { userId } }),
    ]);

    const exportData = JSON.stringify(
      { user, memberships, contributions, kycDocs, auditLogs },
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
      await this.mailService.sendMail({
        to: user.email,
        subject: 'Your data export is ready',
        html: `<p>Your data export is ready. <a href="${downloadUrl}">Download here</a>. Link expires in ${this.expiryHours} hours.</p>`,
      });
    }

    this.logger.log(`Data export completed for user ${userId}`);
  }

  private async handleErasure(userId: string): Promise<void> {
    // Delete KYC S3 objects
    const kycDocs = await this.kycDocRepo.find({ where: { userId } });
    if (kycDocs.length > 0) {
      const objects = kycDocs.map((d) => ({ Key: d.storageKey }));
      await this.s3.send(
        new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: objects },
        }),
      );
      await this.kycDocRepo.delete({ userId });
    }

    // Delete user export objects from S3
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

    // Anonymize PII
    await this.gdprService.anonymizeUser(userId);

    this.logger.log(`Erasure completed for user ${userId}`);
  }
}
