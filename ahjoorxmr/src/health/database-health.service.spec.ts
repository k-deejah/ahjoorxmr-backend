import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { DatabaseHealthService } from './database-health.service';

describe('DatabaseHealthService', () => {
  let service: DatabaseHealthService;
  let mockDataSource: jest.Mocked<DataSource>;

  beforeEach(async () => {
    mockDataSource = {
      isInitialized: true,
      query: jest.fn(),
      driver: {
        master: {
          totalCount: 10,
          idleCount: 8,
          waitingCount: 0,
        },
      },
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DatabaseHealthService,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
      ],
    }).compile();

    service = module.get<DatabaseHealthService>(DatabaseHealthService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('isDatabaseHealthy', () => {
    it('should return healthy status with response time', async () => {
      mockDataSource.query.mockResolvedValue([{ result: 1 }]);

      const result = await service.isDatabaseHealthy();

      expect(result.healthy).toBe(true);
      expect(result.responseTime).toBeGreaterThanOrEqual(0);
      expect(mockDataSource.query).toHaveBeenCalledWith('SELECT 1 as result');
    });

    it('should return unhealthy status on query failure', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection failed'));

      const result = await service.isDatabaseHealthy();

      expect(result.healthy).toBe(false);
      expect(result.error).toBe('Connection failed');
    });

    it('should handle datasource not initialized', async () => {
      mockDataSource.isInitialized = false;

      const result = await service.isDatabaseHealthy();

      expect(result.healthy).toBe(false);
      expect(result.error).toContain('not initialized');
    });
  });

  describe('getPoolStats', () => {
    it('should return connection pool statistics', async () => {
      const result = await service.getPoolStats();

      expect(result).toEqual({
        totalCount: 10,
        idleCount: 8,
        activeCount: 2,
      });
    });

    it('should handle missing pool stats', async () => {
      mockDataSource.driver.master = undefined;

      const result = await service.getPoolStats();

      expect(result).toEqual({
        totalCount: 0,
        idleCount: 0,
        activeCount: 0,
      });
    });
  });

  describe('getDatabaseStats', () => {
    it('should return database statistics', async () => {
      const mockDatabaseSize = [{ size: '50 MB' }];
      const mockTableSizes = [
        { table_name: 'user', row_count: 100, table_size: '1 MB' },
        { table_name: 'group', row_count: 50, table_size: '512 kB' },
      ];

      mockDataSource.query
        .mockResolvedValueOnce(mockDatabaseSize)
        .mockResolvedValueOnce(mockTableSizes);

      const result = await service.getDatabaseStats();

      expect(result.databaseSize).toBe('50 MB');
      expect(result.tables).toHaveLength(2);
      expect(result.tables[0].name).toBe('user');
      expect(result.tables[0].rows).toBe(100);
    });

    it('should handle query errors gracefully', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Query failed'));

      const result = await service.getDatabaseStats();

      expect(result).toEqual({
        databaseSize: 'N/A',
        tables: [],
      });
    });
  });

  describe('checkSlowQueries', () => {
    it('should return slow queries above threshold', async () => {
      const mockSlowQueries = [
        { query: 'SELECT * FROM user WHERE...', avg_time: 1500 },
        { query: 'SELECT * FROM group WHERE...', avg_time: 2000 },
      ];

      mockDataSource.query.mockResolvedValue(mockSlowQueries);

      const result = await service.checkSlowQueries(1000);

      expect(result).toHaveLength(2);
      expect(result[0].query).toBe('SELECT * FROM user WHERE...');
      expect(result[0].avgTime).toBe(1500);
    });

    it('should use default threshold if not provided', async () => {
      mockDataSource.query.mockResolvedValue([]);

      await service.checkSlowQueries();

      expect(mockDataSource.query).toHaveBeenCalledWith(
        expect.stringContaining('1000'),
      );
    });

    it('should return empty array on query failure', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Query failed'));

      const result = await service.checkSlowQueries();

      expect(result).toEqual([]);
    });
  });

  describe('testWrite', () => {
    it('should successfully test write capability', async () => {
      mockDataSource.query.mockResolvedValue(undefined);

      const result = await service.testWrite();

      expect(result.canWrite).toBe(true);
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
    });

    it('should return false on write failure', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Write failed'));

      const result = await service.testWrite();

      expect(result.canWrite).toBe(false);
      expect(result.error).toBe('Write failed');
    });
  });

  describe('getHealthReport', () => {
    it('should return comprehensive health report', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ result: 1 }])
        .mockResolvedValueOnce([{ size: '50 MB' }])
        .mockResolvedValueOnce([
          { table_name: 'user', row_count: 100, table_size: '1 MB' },
        ])
        .mockResolvedValueOnce([]);

      const result = await service.getHealthReport();

      expect(result.status).toBe('healthy');
      expect(result.timestamp).toBeInstanceOf(Date);
      expect(result.database.connected).toBe(true);
      expect(result.pool).toBeDefined();
      expect(result.stats).toBeDefined();
      expect(result.slowQueries).toEqual([]);
    });

    it('should return unhealthy status when database is down', async () => {
      mockDataSource.query.mockRejectedValue(new Error('Connection failed'));

      const result = await service.getHealthReport();

      expect(result.status).toBe('unhealthy');
      expect(result.database.connected).toBe(false);
    });

    it('should include slow query warnings', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ result: 1 }])
        .mockResolvedValueOnce([{ size: '50 MB' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ query: 'SLOW QUERY...', avg_time: 1500 }]);

      const result = await service.getHealthReport();

      expect(result.slowQueries).toHaveLength(1);
      expect(result.slowQueries[0].avgTime).toBe(1500);
    });
  });
});
