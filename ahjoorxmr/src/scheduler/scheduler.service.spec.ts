import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerService } from './scheduler.service';
import { DistributedLockService } from './services/distributed-lock.service';
import { AuditLogService } from './services/audit-log.service';
import { ContributionSummaryService } from './services/contribution-summary.service';
import { GroupStatusService } from './services/group-status.service';

describe('SchedulerService', () => {
  let service: SchedulerService;
  let lockService: jest.Mocked<DistributedLockService>;
  let auditLogService: jest.Mocked<AuditLogService>;
  let contributionSummaryService: jest.Mocked<ContributionSummaryService>;
  let groupStatusService: jest.Mocked<GroupStatusService>;

  beforeEach(async () => {
    const mockLockService = {
      withLock: jest.fn(),
    };

    const mockAuditLogService = {
      archiveOldLogs: jest.fn(),
    };

    const mockContributionSummaryService = {
      generateWeeklySummaries: jest.fn(),
      sendSummariesToMembers: jest.fn(),
    };

    const mockGroupStatusService = {
      updateGroupStatuses: jest.fn(),
      checkInactiveGroups: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SchedulerService,
        {
          provide: DistributedLockService,
          useValue: mockLockService,
        },
        {
          provide: AuditLogService,
          useValue: mockAuditLogService,
        },
        {
          provide: ContributionSummaryService,
          useValue: mockContributionSummaryService,
        },
        {
          provide: GroupStatusService,
          useValue: mockGroupStatusService,
        },
      ],
    }).compile();

    service = module.get<SchedulerService>(SchedulerService);
    lockService = module.get(DistributedLockService);
    auditLogService = module.get(AuditLogService);
    contributionSummaryService = module.get(ContributionSummaryService);
    groupStatusService = module.get(GroupStatusService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleArchiveAuditLogs', () => {
    it('should archive old logs successfully', async () => {
      const archivedCount = 100;
      auditLogService.archiveOldLogs.mockResolvedValue(archivedCount);
      lockService.withLock.mockImplementation(async (name, fn) => await fn());

      await service.handleArchiveAuditLogs();

      expect(lockService.withLock).toHaveBeenCalledWith(
        'archive-audit-logs',
        expect.any(Function),
        600,
      );
      expect(auditLogService.archiveOldLogs).toHaveBeenCalledWith(90);
    });

    it('should skip task if lock cannot be acquired', async () => {
      lockService.withLock.mockResolvedValue(null);

      await service.handleArchiveAuditLogs();

      expect(auditLogService.archiveOldLogs).not.toHaveBeenCalled();
    });
  });

  describe('handleGroupStatusUpdates', () => {
    it('should update group statuses successfully', async () => {
      const updatedCount = 5;
      const inactiveGroups = [];
      groupStatusService.updateGroupStatuses.mockResolvedValue(updatedCount);
      groupStatusService.checkInactiveGroups.mockResolvedValue(inactiveGroups);
      lockService.withLock.mockImplementation(async (name, fn) => await fn());

      await service.handleGroupStatusUpdates();

      expect(lockService.withLock).toHaveBeenCalledWith(
        'update-group-statuses',
        expect.any(Function),
        300,
      );
      expect(groupStatusService.updateGroupStatuses).toHaveBeenCalled();
      expect(groupStatusService.checkInactiveGroups).toHaveBeenCalled();
    });
  });
});
