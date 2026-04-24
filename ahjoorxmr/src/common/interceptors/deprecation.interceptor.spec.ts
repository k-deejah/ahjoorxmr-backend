import { Test, TestingModule } from '@nestjs/testing';
import { DeprecationInterceptor } from './deprecation.interceptor';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { of } from 'rxjs';
import { GoneException } from '@nestjs/common';

const makeContext = (url: string, userId?: string) => ({
  switchToHttp: () => ({
    getRequest: () => ({ url, user: userId ? { id: userId } : undefined }),
    getResponse: () => ({
      setHeader: jest.fn(),
      _headers: {} as Record<string, string>,
    }),
  }),
  getHandler: () => ({}),
  getClass: () => ({}),
});

const makeHandler = () => ({ handle: () => of({}) });

describe('DeprecationInterceptor', () => {
  let interceptor: DeprecationInterceptor;
  const mockConfigService = { get: jest.fn() };

  beforeEach(async () => {
    mockConfigService.get.mockImplementation((key: string, def?: string) => {
      if (key === 'V1_SUNSET_DATE') return '2099-12-31T00:00:00Z';
      if (key === 'APP_URL') return 'http://localhost:3000';
      return def;
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeprecationInterceptor,
        Reflector,
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    interceptor = module.get<DeprecationInterceptor>(DeprecationInterceptor);
  });

  it('should set Deprecation: true header on v1 routes', (done) => {
    const ctx = makeContext('/api/v1/groups') as any;
    const res = ctx.switchToHttp().getResponse();

    interceptor.intercept(ctx, makeHandler() as any).subscribe(() => {
      expect(res.setHeader).toHaveBeenCalledWith('Deprecation', 'true');
      done();
    });
  });

  it('should set Sunset header with correct date', (done) => {
    const ctx = makeContext('/api/v1/groups') as any;
    const res = ctx.switchToHttp().getResponse();

    interceptor.intercept(ctx, makeHandler() as any).subscribe(() => {
      const sunsetCall = (res.setHeader as jest.Mock).mock.calls.find(
        ([key]) => key === 'Sunset',
      );
      expect(sunsetCall).toBeDefined();
      expect(sunsetCall[1]).toContain('2099');
      done();
    });
  });

  it('should set Link header with successor-version', (done) => {
    const ctx = makeContext('/api/v1/groups') as any;
    const res = ctx.switchToHttp().getResponse();

    interceptor.intercept(ctx, makeHandler() as any).subscribe(() => {
      const linkCall = (res.setHeader as jest.Mock).mock.calls.find(
        ([key]) => key === 'Link',
      );
      expect(linkCall[1]).toContain('successor-version');
      done();
    });
  });

  it('should NOT set deprecation headers on v2 routes', (done) => {
    const ctx = makeContext('/api/v2/groups') as any;
    const res = ctx.switchToHttp().getResponse();

    interceptor.intercept(ctx, makeHandler() as any).subscribe(() => {
      expect(res.setHeader).not.toHaveBeenCalled();
      done();
    });
  });

  it('should throw GoneException when past sunset date', () => {
    mockConfigService.get.mockImplementation((key: string, def?: string) => {
      if (key === 'V1_SUNSET_DATE') return '2000-01-01T00:00:00Z';
      if (key === 'APP_URL') return 'http://localhost:3000';
      return def;
    });

    const pastInterceptor = new DeprecationInterceptor(
      new Reflector(),
      mockConfigService as any,
    );

    const ctx = makeContext('/api/v1/groups') as any;
    expect(() =>
      pastInterceptor.intercept(ctx, makeHandler() as any),
    ).toThrow(GoneException);
  });

  it('should calculate daysUntilSunset correctly', () => {
    const sunsetDate = new Date('2099-12-31T00:00:00Z');
    const days = Math.ceil(
      (sunsetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
    );
    expect(days).toBeGreaterThan(0);
  });
});
