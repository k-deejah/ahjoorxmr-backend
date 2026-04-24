import { Test, TestingModule } from '@nestjs/testing';
import { MetricsController } from './metrics.controller';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';

describe('MetricsController', () => {
  let controller: MetricsController;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MetricsController],
      providers: [
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue('test-api-key'),
          },
        },
      ],
    }).compile();

    controller = module.get<MetricsController>(MetricsController);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should return metrics with valid API key', async () => {
    const result = await controller.getMetrics('test-api-key');
    expect(result).toBeDefined();
    expect(typeof result).toBe('string');
  });

  it('should throw UnauthorizedException with invalid API key', async () => {
    await expect(controller.getMetrics('wrong-key')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('should throw UnauthorizedException with missing API key', async () => {
    await expect(controller.getMetrics(undefined)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
