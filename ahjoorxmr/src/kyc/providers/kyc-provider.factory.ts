import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { KycProvider } from '../enums/kyc-provider.enum';
import { KycProviderParser } from './kyc-provider.interface';
import { PersonaParser } from './persona.parser';
import { JumioParser } from './jumio.parser';
import { OnfidoParser } from './onfido.parser';

@Injectable()
export class KycProviderFactory {
  private readonly parser: KycProviderParser;

  constructor(private readonly config: ConfigService) {
    const provider = this.config.get<string>('KYC_PROVIDER', KycProvider.PERSONA);
    this.parser = KycProviderFactory.createParser(provider as KycProvider);
  }

  getParser(): KycProviderParser {
    return this.parser;
  }

  static createParser(provider: KycProvider): KycProviderParser {
    switch (provider) {
      case KycProvider.JUMIO:
        return new JumioParser();
      case KycProvider.ONFIDO:
        return new OnfidoParser();
      case KycProvider.PERSONA:
      default:
        return new PersonaParser();
    }
  }
}
