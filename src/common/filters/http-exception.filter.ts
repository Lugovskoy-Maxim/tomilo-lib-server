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

    const message =
      exception instanceof HttpException
        ? exception.getResponse()
        : 'Internal server error';

    // Логирование ошибки
    this.logger.error(
      `HTTP Exception: ${status} - ${JSON.stringify(message)} - URL: ${
        request.url
      } - Method: ${request.method}`,
      exception instanceof Error ? exception.stack : undefined,
    );

    response.status(status).json({
      success: false,
      message: typeof message === 'string' ? message : 'An error occurred',
      errors: Array.isArray(message) ? message : [message],
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
    });
  }
}
