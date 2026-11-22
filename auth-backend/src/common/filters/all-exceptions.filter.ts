import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { STATUS_CODES } from 'http';

/** The JSON shape of every error response from the API. */
export interface ErrorResponseBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * Turns every thrown error into one consistent JSON shape.
 * HttpExceptions keep their status and message; anything unexpected is
 * logged with its stack trace and returned as a generic 500, so internals
 * (SQL errors, stack traces) never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request>();
    const res = ctx.getResponse<Response>();

    let statusCode = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: string | string[] = 'Internal server error';
    let error = 'Internal Server Error';

    if (exception instanceof HttpException) {
      statusCode = exception.getStatus();
      const statusText = STATUS_CODES[statusCode] ?? 'Error';
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
        error = statusText;
      } else {
        const { message: msg, error: err } = body as {
          message?: string | string[];
          error?: string;
        };
        message = msg ?? exception.message;
        error = err ?? statusText;
      }
    } else {
      this.logger.error(
        `Unhandled error on ${req.method} ${req.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const payload: ErrorResponseBody = {
      statusCode,
      error,
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
    };
    res.status(statusCode).json(payload);
  }
}
