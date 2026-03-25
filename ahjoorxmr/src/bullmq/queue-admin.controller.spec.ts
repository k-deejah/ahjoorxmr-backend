import { Test, TestingModule } from '@nestjs/testing';
import { QueueAdminController } from '../../queue/queue-admin.controller';
import { QueueService, AllQueueStats } from '../../queue/queue.service';
import { QUEUE_NAMES } from '../../queue/queue.constants';

const mockStats: AllQueueStats = {
  queues: [
    {
      name: QUEUE_NAMES.EMAIL,
      waiting: 2,
      active: 1,
      completed: 50,
      failed: 0,
      delayed: 0,
      paused: 0,
    },
    {
      name: QUEUE_NAMES.EVENT_SYNC,
      waiting: 0,
      active: 0,
      completed: 10,
      failed: 1,
      delayed: 0,
      paused: 0,
    },
    {
      name: QUEUE_NAMES.GROUP_SYNC,
      waiting: 1,
      active: 0,
      completed: 5,
      failed: 0,
      delayed: 0,
      paused: 0,
    },
  ],
  deadLetter: {
    name: QUEUE_NAMES.DEAD_LETTER,
    waiting: 1,
    active: 0,
    completed: 0,
    failed: 0,
    delayed: 0,
    paused: 0,
  },
  retrievedAt: new Date().toISOString(),
};

describe('QueueAdminController', () => {
  let controller: QueueAdminController;
  let queueService: jest.Mocked<QueueService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QueueAdminController],
      providers: [
        {
          provide: QueueService,
          useValue: {
            getStats: jest.fn().mockResolvedValue(mockStats),
          },
        },
      ],
    }).compile();

    controller = module.get(QueueAdminController);
    queueService = module.get(QueueService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('getStats()', () => {
    it('should return queue stats from QueueService', async () => {
      const result = await controller.getStats();
      expect(result).toBe(mockStats);
      expect(queueService.getStats).toHaveBeenCalledTimes(1);
    });

    it('should return an object with queues array and deadLetter', async () => {
      const result = await controller.getStats();
      expect(result.queues).toHaveLength(3);
      expect(result.deadLetter).toBeDefined();
      expect(result.retrievedAt).toBeDefined();
    });

    it('should propagate service errors', async () => {
      queueService.getStats.mockRejectedValueOnce(new Error('Redis down'));
      await expect(controller.getStats()).rejects.toThrow('Redis down');
    });
  });
});
