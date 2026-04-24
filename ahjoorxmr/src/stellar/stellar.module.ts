import { Module, forwardRef } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarCircuitBreakerService } from './stellar-circuit-breaker.service';
import { ContractStateGuard } from './contract-state-guard.service';
import { WinstonLogger } from '../common/logger/winston.logger';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  providers: [
    StellarService,
    StellarCircuitBreakerService,
    ContractStateGuard,
    WinstonLogger,
  ],
  exports: [StellarService, StellarCircuitBreakerService, ContractStateGuard],
})
export class StellarModule {}
