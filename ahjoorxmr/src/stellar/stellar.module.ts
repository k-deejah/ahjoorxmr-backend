import { Module, forwardRef } from '@nestjs/common';
import { StellarService } from './stellar.service';
import { StellarCircuitBreakerService } from './stellar-circuit-breaker.service';
import { ContractStateGuard } from './contract-state-guard.service';
import { StellarAdminController } from './stellar-admin.controller';
import { WinstonLogger } from '../common/logger/winston.logger';
import { MetricsModule } from '../metrics/metrics.module';

@Module({
  controllers: [StellarAdminController],
  providers: [
    StellarService,
    StellarCircuitBreakerService,
    ContractStateGuard,
    WinstonLogger,
  ],
  exports: [StellarService, StellarCircuitBreakerService, ContractStateGuard],
})
export class StellarModule {}
