import { Test, TestingModule } from '@nestjs/testing';
import { MetricsInterceptor } from './metrics.interceptor';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { Counter, Histogram } from 'prom-client';

describe('MetricsInterceptor', () => {
  let interceptor: MetricsInterceptor;
  let mockCounter: jest.Mocked<Counter<string>>;
  let mockHistogram: jest.Mocked<Histogram<string>>;

  beforeEach(async () => {
    mockCounter = {
      inc: jest.fn(),
    } as any;

    mockHistogram = {
      observe: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MetricsInterceptor,
        {
          provide: 'PROM_METRIC_HTTP_REQUESTS_TOTAL',
          useValue: mockCounter,
        },
        {
          provide: 'PROM_METRIC_HTTP_REQUEST_DURATION_SECONDS',
          useValue: mockHistogram,
        },
      ],
    }).compile();

    interceptor = module.get<MetricsInterceptor>(MetricsInterceptor);
  });

  it('should be defined', () => {
    expect(interceptor).toBeDefined();
  });

  it('should increment counter on successful request', (done) => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/test',
          route: { path: '/test' },
        }),
        getResponse: () => ({
          statusCode: 200,
        }),
      }),
    } as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of('test'),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockCounter.inc).toHaveBeenCalledWith({
          method: 'GET',
          route: '/test',
          status: '200',
        });
        expect(mockHistogram.observe).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should increment counter on error', (done) => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'POST',
          url: '/test',
          route: { path: '/test' },
        }),
        getResponse: () => ({
          statusCode: 500,
        }),
      }),
    } as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => throwError(() => ({ status: 500 })),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      error: () => {
        expect(mockCounter.inc).toHaveBeenCalledWith({
          method: 'POST',
          route: '/test',
          status: '500',
        });
        expect(mockHistogram.observe).toHaveBeenCalled();
        done();
      },
    });
  });

  it('should record request duration', (done) => {
    const mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          method: 'GET',
          url: '/test',
          route: { path: '/test' },
        }),
        getResponse: () => ({
          statusCode: 200,
        }),
      }),
    } as ExecutionContext;

    const mockCallHandler: CallHandler = {
      handle: () => of('test'),
    };

    interceptor.intercept(mockExecutionContext, mockCallHandler).subscribe({
      next: () => {
        expect(mockHistogram.observe).toHaveBeenCalledWith(
          expect.objectContaining({
            method: 'GET',
            route: '/test',
            status: '200',
          }),
          expect.any(Number),
        );
        done();
      },
    });
  });
});
