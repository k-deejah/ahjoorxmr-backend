import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TrustedIpService } from './trusted-ip.service';
import Redis from 'ioredis';

describe('TrustedIpService', () => {
  let service: TrustedIpService;
  let mockRedis: jest.Mocked<Redis>;
  let mockConfigService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockRedis = {
      setex: jest.fn(),
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      keys: jest.fn(),
    } as any;

    mockConfigService = {
      get: jest.fn((key: string, defaultValue?: string) => {
        if (key === 'TRUSTED_IPS') {
          return '127.0.0.1,10.0.0.1';
        }
        if (key === 'TRUSTED_IP_RANGES') {
          return '192.168.1.1-192.168.1.255';
        }
        return defaultValue;
      }),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TrustedIpService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
        {
          provide: 'default_IORedisModuleConnectionToken',
          useValue: mockRedis,
        },
      ],
    }).compile();

    service = module.get<TrustedIpService>(TrustedIpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isTrustedIp', () => {
    it('should return true for exact match in trusted list', () => {
      expect(service.isTrustedIp('127.0.0.1')).toBe(true);
      expect(service.isTrustedIp('10.0.0.1')).toBe(true);
    });

    it('should return true for IP in trusted range', () => {
      expect(service.isTrustedIp('192.168.1.100')).toBe(true);
      expect(service.isTrustedIp('192.168.1.1')).toBe(true);
      expect(service.isTrustedIp('192.168.1.255')).toBe(true);
    });

    it('should return false for untrusted IP', () => {
      expect(service.isTrustedIp('8.8.8.8')).toBe(false);
      expect(service.isTrustedIp('192.168.2.1')).toBe(false);
    });

    it('should return false for invalid IP', () => {
      expect(service.isTrustedIp('')).toBe(false);
      expect(service.isTrustedIp(null as any)).toBe(false);
    });
  });

  describe('addTrustedIp', () => {
    it('should add IP to trusted list without TTL', async () => {
      await service.addTrustedIp('1.2.3.4');

      expect(mockRedis.set).toHaveBeenCalledWith('trusted_ip:1.2.3.4', '1');
      expect(service.isTrustedIp('1.2.3.4')).toBe(true);
    });

    it('should add IP to trusted list with TTL', async () => {
      await service.addTrustedIp('1.2.3.4', 3600);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'trusted_ip:1.2.3.4',
        3600,
        '1',
      );
      expect(service.isTrustedIp('1.2.3.4')).toBe(true);
    });
  });

  describe('removeTrustedIp', () => {
    it('should remove IP from trusted list', async () => {
      await service.addTrustedIp('1.2.3.4');
      expect(service.isTrustedIp('1.2.3.4')).toBe(true);

      await service.removeTrustedIp('1.2.3.4');
      expect(service.isTrustedIp('1.2.3.4')).toBe(false);
      expect(mockRedis.del).toHaveBeenCalledWith('trusted_ip:1.2.3.4');
    });
  });

  describe('blockIp', () => {
    it('should block IP with reason', async () => {
      await service.blockIp('1.2.3.4', 3600, 'Spam detected');

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'blocked_ip:1.2.3.4',
        3600,
        'Spam detected',
      );
    });

    it('should block IP with default reason', async () => {
      await service.blockIp('1.2.3.4', 3600);

      expect(mockRedis.setex).toHaveBeenCalledWith(
        'blocked_ip:1.2.3.4',
        3600,
        'Rate limit exceeded',
      );
    });
  });

  describe('isIpBlocked', () => {
    it('should return blocked status for blocked IP', async () => {
      mockRedis.get.mockResolvedValue('Spam detected');

      const result = await service.isIpBlocked('1.2.3.4');

      expect(result).toEqual({
        blocked: true,
        reason: 'Spam detected',
      });
      expect(mockRedis.get).toHaveBeenCalledWith('blocked_ip:1.2.3.4');
    });

    it('should return not blocked status for unblocked IP', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await service.isIpBlocked('1.2.3.4');

      expect(result).toEqual({
        blocked: false,
      });
    });
  });

  describe('unblockIp', () => {
    it('should unblock IP', async () => {
      await service.unblockIp('1.2.3.4');

      expect(mockRedis.del).toHaveBeenCalledWith('blocked_ip:1.2.3.4');
    });
  });

  describe('incrementViolations', () => {
    it('should increment violations and not block below threshold', async () => {
      mockRedis.incr.mockResolvedValue(3);

      const result = await service.incrementViolations('1.2.3.4', 5, 3600);

      expect(result).toEqual({
        count: 3,
        shouldBlock: false,
      });
      expect(mockRedis.incr).toHaveBeenCalledWith('violations:1.2.3.4');
      expect(mockRedis.expire).toHaveBeenCalledWith('violations:1.2.3.4', 3600);
    });

    it('should block IP when threshold is exceeded', async () => {
      mockRedis.incr.mockResolvedValue(5);

      const result = await service.incrementViolations('1.2.3.4', 5, 3600);

      expect(result).toEqual({
        count: 5,
        shouldBlock: true,
      });
      expect(mockRedis.setex).toHaveBeenCalledWith(
        'blocked_ip:1.2.3.4',
        3600,
        'Exceeded 5 violations in 3600s',
      );
    });
  });

  describe('getIpInfo', () => {
    it('should return comprehensive IP information', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null) // isTrustedInRedis
        .mockResolvedValueOnce(null) // isIpBlocked
        .mockResolvedValueOnce('3'); // violations

      const result = await service.getIpInfo('8.8.8.8');

      expect(result).toEqual({
        ip: '8.8.8.8',
        trusted: false,
        blocked: false,
        violations: 3,
        blockReason: undefined,
      });
    });

    it('should show trusted status for trusted IP', async () => {
      mockRedis.get
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce('0');

      const result = await service.getIpInfo('127.0.0.1');

      expect(result.trusted).toBe(true);
    });
  });

  describe('getBlockedIps', () => {
    it('should return all blocked IPs with details', async () => {
      mockRedis.keys.mockResolvedValue([
        'blocked_ip:1.2.3.4',
        'blocked_ip:5.6.7.8',
      ] as any);
      mockRedis.get.mockResolvedValueOnce('Spam').mockResolvedValueOnce('DDoS');
      mockRedis.ttl.mockResolvedValueOnce(3600).mockResolvedValueOnce(7200);

      const result = await service.getBlockedIps();

      expect(result).toEqual([
        { ip: '1.2.3.4', reason: 'Spam', ttl: 3600 },
        { ip: '5.6.7.8', reason: 'DDoS', ttl: 7200 },
      ]);
    });

    it('should return empty array when no IPs are blocked', async () => {
      mockRedis.keys.mockResolvedValue([]);

      const result = await service.getBlockedIps();

      expect(result).toEqual([]);
    });
  });
});
