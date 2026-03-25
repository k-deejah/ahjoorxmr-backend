import { Test, TestingModule } from '@nestjs/testing';
import { RedisThrottlerStorageService } from './redis-throttler-storage.service';
import { getRedisToken } from '@nestjs-modules/ioredis';

describe('RedisThrottlerStorageService', () => {
  let service: RedisThrottlerStorageService;
  let redisMock: any;

  beforeEach(async () => {
    redisMock = {
      multi: jest.fn().mockReturnThis(),
      incr: jest.fn().mockReturnThis(),
      pexpire: jest.fn().mockReturnThis(),
      pttl: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([
        [null, 1], // incr result
        [null, 'OK'], // pexpire result
        [null, 60000], // pttl result
      ]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RedisThrottlerStorageService,
        {
          provide: getRedisToken('default'),
          useValue: redisMock,
        },
      ],
    }).compile();

    service = module.get<RedisThrottlerStorageService>(
      RedisThrottlerStorageService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('increment', () => {
    it('should increment counter and return correct values', async () => {
      const key = 'test-key';
      const ttl = 60000;

      const result = await service.increment(key, ttl);

      expect(result).toEqual({
        totalHits: 1,
        timeToExpire: 60000,
      });

      expect(redisMock.multi).toHaveBeenCalled();
      expect(redisMock.exec).toHaveBeenCalled();
    });

    it('should handle multiple increments', async () => {
      redisMock.exec.mockResolvedValue([
        [null, 5], // incr result (5th request)
        [null, 'OK'], // pexpire result
        [null, 45000], // pttl result (45 seconds remaining)
      ]);

      const key = 'test-key';
      const ttl = 60000;

      const result = await service.increment(key, ttl);

      expect(result).toEqual({
        totalHits: 5,
        timeToExpire: 45000,
      });
    });

    it('should throw error if Redis transaction fails', async () => {
      redisMock.exec.mockResolvedValue(null);

      const key = 'test-key';
      const ttl = 60000;

      await expect(service.increment(key, ttl)).rejects.toThrow(
        'Redis transaction failed',
      );
    });
  });
});
