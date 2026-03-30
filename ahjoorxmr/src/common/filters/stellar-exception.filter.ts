import {
    ExceptionFilter,
    Catch,
    ArgumentsHost,
    BadRequestException,
    Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/**
 * Catches Stellar SDK errors and transforms them into user-friendly 400 Bad Request responses.
 * Prevents stack trace leakage and provides clear error messages for invalid Stellar addresses.
 */
@Catch()
export class StellarExceptionFilter implements ExceptionFilter {
    private readonly logger = new Logger(StellarExceptionFilter.name);

    catch(exception: unknown, host: ArgumentsHost): void {
        const ctx = host.switchToHttp();
        const response = ctx.getResponse<Response>();
        const request = ctx.getRequest<Request>();

        // Check if this is a Stellar SDK error
        if (this.isStellarError(exception)) {
            this.logger.warn(
                JSON.stringify({
                    event: 'stellar_validation_error',
                    path: request.url,
                    method: request.method,
                    timestamp: new Date().toISOString(),
                }),
            );

            const errorResponse = {
                statusCode: 400,
                error: 'Bad Request',
                message: 'Invalid Stellar address format. Expected format: G[A-Z2-7]{55} for public keys.',
                timestamp: new Date().toISOString(),
                path: request.url,
            };

            response.status(400).json(errorResponse);
            return;
        }

        // Re-throw if not a Stellar error
        throw exception;
    }

    private isStellarError(exception: unknown): boolean {
        if (!(exception instanceof Error)) {
            return false;
        }

        const message = exception.message.toLowerCase();
        return (
            message.includes('strkey') ||
            message.includes('stellar') ||
            message.includes('invalid public key') ||
            message.includes('invalid secret key')
        );
    }
}
