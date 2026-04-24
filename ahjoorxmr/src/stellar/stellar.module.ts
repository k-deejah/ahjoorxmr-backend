import { Module, forwardRef } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarCircuitBreakerService } from './stellar-circuit-breaker.service';
import { WinstonLogger } from '../common/logger/winston.logger';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  imports: [forwardRef(() => MetricsModule)],
  providers: [StellarService, StellarCircuitBreakerService, WinstonLogger],
  exports: [StellarService, StellarCircuitBreakerService],
})
export class StellarModule {}
