import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const raw =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Нормализация: ValidationPipe возвращает { message: string[], error: string }
    const message =
      typeof raw === 'object' && raw !== null && 'message' in raw
        ? (raw as { message: string | string[] }).message
        : raw;
    const errors = Array.isArray(message) ? message : [message];

    const authHeader = request.headers.authorization;
    const userAgent = request.headers['user-agent'];
    const ip = request.ip;
    // В production не логируем полный Authorization, чтобы не светить токены
    const authLog =
      process.env.NODE_ENV === 'production'
        ? authHeader
          ? `Auth: present (length ${authHeader.length})`
          : 'Auth: absent'
        : `Auth Header: ${authHeader}`;

    this.logger.error(
      `HTTP Exception: ${status} - ${JSON.stringify(errors)} - URL: ${request.url} - Method: ${request.method} - IP: ${ip} - User-Agent: ${userAgent} - ${authLog}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      success: false,
      message:
        typeof message === 'string'
          ? message
          : (errors[0] ?? 'An error occurred'),
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
