import { Test, TestingModule } from '@nestjs/testing';
import { MetricsService } from './metrics.service';
import { Counter, Gauge } from 'prom-client';

describe('MetricsService', () => {
  let service: MetricsService;
  let mockBullMQCounter: jest.Mocked<Counter<string>>;
  let mockStellarCounter: jest.Mocked<Counter<string>>;
  let mockDbGauge: jest.Mocked<Gauge<string>>;

  beforeEach(async () => {
    mockBullMQCounter = {
      inc: jest.fn(),
    } as any;

    mockStellarCounter = {
      inc: jest.fn(),
    } as any;

    mockDbGauge = {
      set: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsService,
        {
          provide: 'PROM_METRIC_BULLMQ_JOBS_TOTAL',
          useValue: mockBullMQCounter,
        },
        {
          provide: 'PROM_METRIC_STELLAR_TRANSACTIONS_TOTAL',
          useValue: mockStellarCounter,
        },
        {
          provide: 'PROM_METRIC_DB_POOL_ACTIVE_CONNECTIONS',
          useValue: mockDbGauge,
        },
      ],
    }).compile();

    service = module.get<MetricsService>(MetricsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should increment BullMQ job counter', () => {
    service.incrementBullMQJob('email', 'completed');
    expect(mockBullMQCounter.inc).toHaveBeenCalledWith({
      queue: 'email',
      state: 'completed',
    });
  });

  it('should increment Stellar transaction counter for success', () => {
    service.incrementStellarTransaction(true);
    expect(mockStellarCounter.inc).toHaveBeenCalledWith({
      status: 'success',
    });
  });

  it('should increment Stellar transaction counter for failure', () => {
    service.incrementStellarTransaction(false);
    expect(mockStellarCounter.inc).toHaveBeenCalledWith({
      status: 'failure',
    });
  });

  it('should set database pool active connections', () => {
    service.setDbPoolActiveConnections(10);
    expect(mockDbGauge.set).toHaveBeenCalledWith(10);
  });
});
