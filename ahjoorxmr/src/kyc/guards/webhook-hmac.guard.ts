import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { KycProviderFactory } from '../providers/kyc-provider.factory';

/** Validates the HMAC signature on incoming KYC webhook requests. */
@Injectable()
export class WebhookHmacGuard implements CanActivate {
  private readonly logger = new Logger(WebhookHmacGuard.name);

  constructor(
    private readonly config: ConfigService,
    private readonly providerFactory: KycProviderFactory,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request & { rawBody?: Buffer }>();
    const secret = this.config.get<string>('KYC_WEBHOOK_SECRET');

    if (!secret) {
      this.logger.error('KYC_WEBHOOK_SECRET is not configured');
      throw new UnauthorizedException('Webhook secret not configured');
    }

    // NestJS raw body is available when bodyParser rawBody option is enabled
    const rawBody: Buffer | undefined = req.rawBody;
    if (!rawBody) {
      this.logger.error('Raw body not available – ensure rawBody is enabled in NestFactory');
      throw new UnauthorizedException('Cannot verify signature: raw body unavailable');
    }

    // Try common signature header names across providers
    const signature =
      (req.headers['persona-signature'] as string) ||
      (req.headers['x-jumio-signature'] as string) ||
      (req.headers['x-sha2-signature'] as string) ||
      (req.headers['x-hub-signature-256'] as string) ||
      '';

    if (!signature) {
      this.logger.warn('Webhook request missing signature header');
      throw new UnauthorizedException('Missing webhook signature');
    }

    const parser = this.providerFactory.getParser();
    const valid = parser.validateSignature(rawBody, signature, secret);

    if (!valid) {
      this.logger.warn('Webhook HMAC validation failed');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    return true;
  }
}
