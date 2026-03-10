import { Injectable, ConsoleLogger, Scope } from '@nestjs/common';
import * as winston from 'winston';
import DailyRotateFile from 'winston-daily-rotate-file';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

@Injectable({ scope: Scope.TRANSIENT })
export class LoggerService extends ConsoleLogger {
  private readonly winstonLogger: winston.Logger;

  constructor() {
    super();

    // Убедимся, что директория для логов существует
    const logDir = join(process.cwd(), 'logs');
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }

    this.winstonLogger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss',
        }),
        winston.format.errors({ stack: true }),
        winston.format.splat(),
        winston.format.json(),
      ),
      defaultMeta: { service: 'manga-server' },
      transports: [
        // Запись всех логов уровня error и выше в error.log
        new DailyRotateFile({
          filename: join(logDir, 'error-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
          level: 'error',
        }),
        // Запись всех логов уровня info и выше в combined.log
        new DailyRotateFile({
          filename: join(logDir, 'combined-%DATE%.log'),
          datePattern: 'YYYY-MM-DD',
          zippedArchive: true,
          maxSize: '20m',
          maxFiles: '14d',
        }),
      ],
    });

    // В режиме разработки также выводим в консоль
    if (process.env.NODE_ENV !== 'production') {
      this.winstonLogger.add(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
          ),
        }),
      );
    }
  }

  log(message: string, context?: string) {
    const ctx = context ?? this.context;
    super.log(message, ctx);
    this.winstonLogger.info(message, ctx ? { context: ctx } : {});
  }

  error(message: string, trace?: string, context?: string) {
    const ctx = context ?? this.context;
    super.error(message, trace, ctx);
    this.winstonLogger.error(message, { trace, ...(ctx && { context: ctx }) });
  }

  warn(message: string, context?: string) {
    const ctx = context ?? this.context;
    super.warn(message, ctx);
    this.winstonLogger.warn(message, ctx ? { context: ctx } : {});
  }

  debug(message: string, context?: string) {
    const ctx = context ?? this.context;
    super.debug(message, ctx);
    this.winstonLogger.debug(message, ctx ? { context: ctx } : {});
  }

  verbose(message: string, context?: string) {
    const ctx = context ?? this.context;
    super.verbose(message, ctx);
    this.winstonLogger.verbose(message, ctx ? { context: ctx } : {});
  }
}
