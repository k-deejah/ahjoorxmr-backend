import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Histogram } from 'prom-client';

@Injectable()
export class MetricsInterceptor implements NestInterceptor {
  constructor(
    @InjectMetric('http_requests_total')
    private readonly httpRequestsTotal: Counter<string>,
    @InjectMetric('http_request_duration_seconds')
    private readonly httpRequestDuration: Histogram<string>,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();
    const start = Date.now();

    return next.handle().pipe(
      tap({
        next: () => {
          const duration = (Date.now() - start) / 1000;
          const route = request.route?.path || request.url;
          const method = request.method;
          const status = response.statusCode;

          this.httpRequestsTotal.inc({
            method,
            route,
            status: status.toString(),
          });

          this.httpRequestDuration.observe(
            { method, route, status: status.toString() },
            duration,
          );
        },
        error: (error) => {
          const duration = (Date.now() - start) / 1000;
          const route = request.route?.path || request.url;
          const method = request.method;
          const status = error.status || 500;

          this.httpRequestsTotal.inc({
            method,
            route,
            status: status.toString(),
          });

          this.httpRequestDuration.observe(
            { method, route, status: status.toString() },
            duration,
          );
        },
      }),
    );
  }
}
