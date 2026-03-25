import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';

/**
 * Interceptor that adds deprecation warning headers for deprecated API versions.
 * Use @SetMetadata('deprecated', true) on controllers or routes to mark them as deprecated.
 */
@Injectable()
export class ApiVersionDeprecationInterceptor implements NestInterceptor {
  constructor(private reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse();
    const request = context.switchToHttp().getRequest();

    // Check if the route is marked as deprecated
    const isDeprecated =
      this.reflector.get<boolean>('deprecated', context.getHandler()) ||
      this.reflector.get<boolean>('deprecated', context.getClass());

    // Check if version is deprecated (you can extend this logic)
    const version =
      request.headers['x-api-version'] || this.getVersionFromUrl(request.url);
    const deprecatedVersions = ['0']; // Add versions to deprecate here

    return next.handle().pipe(
      map((data) => {
        if (isDeprecated || deprecatedVersions.includes(version)) {
          response.setHeader('X-API-Deprecated', 'true');
          response.setHeader(
            'X-API-Deprecation-Info',
            'This API version is deprecated. Please migrate to the latest version.',
          );
          response.setHeader('X-API-Sunset-Date', '2027-12-31');
        }
        return data;
      }),
    );
  }

  private getVersionFromUrl(url: string): string {
    const versionMatch = url.match(/\/v(\d+)\//);
    return versionMatch ? versionMatch[1] : '1';
  }
}
