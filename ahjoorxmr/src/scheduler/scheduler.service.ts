import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DistributedLockService } from './services/distributed-lock.service';
import { AuditLogService } from './services/audit-log.service';
import { ContributionSummaryService } from './services/contribution-summary.service';
import { GroupStatusService } from './services/group-status.service';
import { StaleGroupDetectionService } from './services/stale-group-detection.service';

@Injectable()
export class SchedulerService {
  private readonly logger = new Logger(SchedulerService.name);
  private readonly maxRetries = 3;
  private readonly baseDelay = 1000; // 1 second

  constructor(
    private readonly lockService: DistributedLockService,
    private readonly auditLogService: AuditLogService,
    private readonly contributionSummaryService: ContributionSummaryService,
    private readonly groupStatusService: GroupStatusService,
    private readonly staleGroupDetectionService: StaleGroupDetectionService,
  ) {}

  /**
   * Daily task: Archive old audit logs (runs at 2 AM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_2AM, {
    name: 'archive-audit-logs',
  })
  async handleArchiveAuditLogs(): Promise<void> {
    const taskName = 'archive-audit-logs';
    const startTime = Date.now();

    this.logger.log(`Starting task: ${taskName}`);

    const result = await this.lockService.withLock(
      taskName,
      async () => {
        return await this.executeWithRetry(async () => {
          const archivedCount = await this.auditLogService.archiveOldLogs(90);
          return { archivedCount };
        }, taskName);
      },
      600, // 10 minutes lock TTL
    );

    const duration = Date.now() - startTime;

    if (result) {
      this.logger.log(
        `Task ${taskName} completed successfully in ${duration}ms. Archived ${result.archivedCount} logs.`,
      );
    } else {
      this.logger.warn(`Task ${taskName} was skipped (lock not acquired)`);
    }
  }

  /**
   * Weekly task: Send contribution summaries (runs every Monday at 9 AM)
   */
  @Cron(CronExpression.MONDAY_TO_FRIDAY_AT_9AM, {
    name: 'send-contribution-summaries',
  })
  async handleContributionSummaries(): Promise<void> {
    const taskName = 'send-contribution-summaries';
    const startTime = Date.now();

    // Only run on Mondays
    const today = new Date().getDay();
    if (today !== 1) {
      return;
    }

    this.logger.log(`Starting task: ${taskName}`);

    const result = await this.lockService.withLock(
      taskName,
      async () => {
        return await this.executeWithRetry(async () => {
          const summaries =
            await this.contributionSummaryService.generateWeeklySummaries();
          await this.contributionSummaryService.sendSummariesToMembers(
            summaries,
          );
          return { summaryCount: summaries.length };
        }, taskName);
      },
      600, // 10 minutes lock TTL
    );

    const duration = Date.now() - startTime;

    if (result) {
      this.logger.log(
        `Task ${taskName} completed successfully in ${duration}ms. Sent ${result.summaryCount} summaries.`,
      );
    } else {
      this.logger.warn(`Task ${taskName} was skipped (lock not acquired)`);
    }
  }

  /**
   * Hourly task: Check and update group statuses
   */
  @Cron(CronExpression.EVERY_HOUR, {
    name: 'update-group-statuses',
  })
  async handleGroupStatusUpdates(): Promise<void> {
    const taskName = 'update-group-statuses';
    const startTime = Date.now();

    this.logger.log(`Starting task: ${taskName}`);

    const result = await this.lockService.withLock(
      taskName,
      async () => {
        return await this.executeWithRetry(async () => {
          const updatedCount =
            await this.groupStatusService.updateGroupStatuses();
          const inactiveGroups =
            await this.groupStatusService.checkInactiveGroups();
          return { updatedCount, inactiveGroupCount: inactiveGroups.length };
        }, taskName);
      },
      300, // 5 minutes lock TTL
    );

    const duration = Date.now() - startTime;

    if (result) {
      this.logger.log(
        `Task ${taskName} completed successfully in ${duration}ms. Updated ${result.updatedCount} groups, found ${result.inactiveGroupCount} inactive groups.`,
      );
    } else {
      this.logger.warn(`Task ${taskName} was skipped (lock not acquired)`);
    }
  }

  /**
   * Daily task: Detect and flag stale groups (runs at 3 AM)
   */
  @Cron(CronExpression.EVERY_DAY_AT_3AM, {
    name: 'detect-stale-groups',
  })
  async handleStaleGroupDetection(): Promise<void> {
    const taskName = 'detect-stale-groups';
    const startTime = Date.now();

    this.logger.log(`Starting task: ${taskName}`);

    const result = await this.lockService.withLock(
      taskName,
      async () => {
        return await this.executeWithRetry(async () => {
          const flaggedCount =
            await this.staleGroupDetectionService.detectAndFlagStaleGroups();
          return { flaggedCount };
        }, taskName);
      },
      600, // 10 minutes lock TTL
    );

    const duration = Date.now() - startTime;

    if (result) {
      this.logger.log(
        `Task ${taskName} completed successfully in ${duration}ms. Flagged ${result.flaggedCount} stale group(s).`,
      );
    } else {
      this.logger.warn(`Task ${taskName} was skipped (lock not acquired)`);
    }
  }

  /**
   * Execute a task with exponential backoff retry logic
   */
  private async executeWithRetry<T>(
    fn: () => Promise<T>,
    taskName: string,
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        this.logger.error(
          `Task ${taskName} failed on attempt ${attempt}/${this.maxRetries}:`,
          error,
        );

        if (attempt < this.maxRetries) {
          const delay = this.baseDelay * Math.pow(2, attempt - 1);
          this.logger.log(`Retrying in ${delay}ms...`);
          await this.sleep(delay);
        }
      }
    }

    throw new Error(
      `Task ${taskName} failed after ${this.maxRetries} attempts: ${lastError?.message}`,
    );
  }

  /**
   * Sleep utility for retry delays
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
