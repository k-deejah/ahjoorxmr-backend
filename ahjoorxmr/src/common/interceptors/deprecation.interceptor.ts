import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
  GoneException,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DeprecationInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DeprecationInterceptor.name);
  private readonly sunsetDate: Date | null;
  private readonly successorUrl: string;

  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService,
  ) {
    const raw = this.configService.get<string>('V1_SUNSET_DATE');
    this.sunsetDate = raw ? new Date(raw) : null;
    this.successorUrl =
      this.configService.get<string>('APP_URL', 'http://localhost:3000') +
      '/api/v2';
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    const version = this.getVersionFromUrl(request.url);
    if (version !== '1') {
      return next.handle();
    }

    // After sunset date, return 410 Gone
    if (this.sunsetDate && new Date() > this.sunsetDate) {
      throw new GoneException(
        'This API version has been sunset. Please migrate to v2.',
      );
    }

    const daysUntilSunset = this.sunsetDate
      ? Math.ceil(
          (this.sunsetDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24),
        )
      : null;

    const userId = request.user?.id ?? 'anonymous';
    const route = request.url;

    this.logger.warn({
      message: 'Deprecated v1 API call',
      userId,
      route,
      daysUntilSunset,
    });

    return next.handle().pipe(
      tap(() => {
        response.setHeader('Deprecation', 'true');
        if (this.sunsetDate) {
          response.setHeader('Sunset', this.sunsetDate.toUTCString());
        }
        response.setHeader(
          'Link',
          `<${this.successorUrl}>; rel="successor-version"`,
        );
      }),
    );
  }

  private getVersionFromUrl(url: string): string {
    const match = url.match(/\/api\/v(\d+)\//);
    return match ? match[1] : '1';
  }
}
