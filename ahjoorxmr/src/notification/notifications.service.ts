import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { Notification } from './notification.entity';
import { NotificationType } from './notification-type.enum';
import { PaginateNotificationsDto, NotifyDto } from './notifications.dto';

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const EMAIL_TEMPLATE_MAP: Partial<Record<NotificationType, string>> = {
  [NotificationType.ROUND_OPENED]: 'round-opened',
  [NotificationType.CONTRIBUTION_REMINDER]: 'contribution-reminder',
  [NotificationType.PAYOUT_RECEIVED]: 'payout-received',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    private readonly mailerService: MailerService,
  ) {}

  /**
   * Core notify method: creates a DB record and optionally queues an email.
   * Email sending is always asynchronous — it never blocks the caller.
   */
  async notify(dto: NotifyDto): Promise<Notification> {
    const notification = this.notificationRepo.create({
      userId: dto.userId,
      type: dto.type,
      title: dto.title,
      body: dto.body,
      metadata: dto.metadata ?? {},
    });

    const saved = await this.notificationRepo.save(notification);

    if (dto.sendEmail && dto.emailTo) {
      setImmediate(() =>
        this.sendEmail(dto).catch((err) => {
          this.logger.error(
            `Failed to send email for notification ${saved.id}: ${err.message}`,
            err.stack,
          );
        }),
      );
    }

    return saved;
  }

  async findAll(
    userId: string,
    query: PaginateNotificationsDto,
  ): Promise<PaginatedResult<Notification>> {
    const { page = 1, limit = 20, type } = query;
    const skip = (page - 1) * limit;

    const where: Record<string, any> = { userId };
    if (type) where.type = type;

    const [data, total] = await this.notificationRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      data,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async markAsRead(id: string, userId: string): Promise<Notification> {
    const notification = await this.notificationRepo.findOne({ where: { id } });

    if (!notification) {
      throw new NotFoundException(`Notification ${id} not found`);
    }

    if (notification.userId !== userId) {
      throw new ForbiddenException('Cannot access this notification');
    }

    notification.isRead = true;
    return this.notificationRepo.save(notification);
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const result = await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ isRead: true })
      .where('userId = :userId AND isRead = false', { userId })
      .execute();

    return { updated: result.affected ?? 0 };
  }

  async getUnreadCount(userId: string): Promise<number> {
    return this.notificationRepo.count({
      where: { userId, isRead: false },
    });
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private async sendEmail(dto: NotifyDto): Promise<void> {
    const template = EMAIL_TEMPLATE_MAP[dto.type];

    if (!template) {
      this.logger.debug(`No email template for type ${dto.type}, skipping.`);
      return;
    }

    await this.mailerService.sendMail({
      to: dto.emailTo,
      subject: dto.title,
      template,
      context: {
        title: dto.title,
        body: dto.body,
        ...(dto.emailTemplateData ?? {}),
      },
    });

    this.logger.log(`Email sent to ${dto.emailTo} [${dto.type}]`);
  }
}
