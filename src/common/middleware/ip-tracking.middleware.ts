import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

// Расширение интерфейса Request для добавления поля realIP
// Типы определены в src/types/express/index.d.ts

@Injectable()
export class IPTrackingMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    // Получаем реальный IP из заголовков
    const forwarded = req.headers['x-forwarded-for'];
    const realIP = req.headers['x-real-ip'];

    let ip: string | undefined;
    if (typeof forwarded === 'string') {
      // X-Forwarded-For может содержать несколько IP, первый - реальный клиент
      ip = forwarded.split(',')[0].trim();
    } else if (typeof realIP === 'string') {
      ip = realIP;
    } else {
      ip = req.socket?.remoteAddress || 'unknown';
    }

    // Удаляем префикс ::ffff: для IPv4-mapped IPv6 адресов
    if (ip && ip.startsWith('::ffff:')) {
      req.realIP = ip.substring(7);
    } else {
      req.realIP = ip;
    }

    next();
  }
}
