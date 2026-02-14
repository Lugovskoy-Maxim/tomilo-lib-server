import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { join } from 'path';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { LoggerService } from './common/logger/logger.service';
import cookieParser from 'cookie-parser';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(cookieParser());

  // Увеличиваем лимит размера тела запроса до 50MB
  app.useBodyParser('json', { limit: '50mb' });
  app.useBodyParser('urlencoded', { limit: '50mb', extended: true });
  const logger = new LoggerService();

  // Устанавливаем заголовки для правильной кодировки, кроме запросов к статическим файлам uploads
  app.use((req, res, next) => {
    if (!req.url.startsWith('/uploads/')) {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
    }
    next();
  });

  app.enableCors({
    origin: [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://localhost:3001',
      'http://127.0.0.1:3001',
      'http://localhost:3002',
      'http://127.0.0.1:3002',
      'https://tomilo-lib.ru',
      'http://tomilo-lib.ru',
      'http://46.72.32.145',
      'https://46.72.32.145',
    ],
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    credentials: true,
    allowedHeaders: 'Authorization, Content-Type, Accept',
  });
  // app.enableCors();

  app.setGlobalPrefix('api');

  // Префикс для раздачи статических файлов
  app.useStaticAssets(join(__dirname, '..', 'uploads'), {
    prefix: '/uploads/',
  });

  // Раздача статических файлов из папки public
  app.useStaticAssets(join(__dirname, '..', 'public'), {
    prefix: '/public/',
  });

  // Настройка глобальной валидации
  app.useGlobalPipes(new ValidationPipe());

  // Добавляем глобальный фильтр исключений
  app.useGlobalFilters(new HttpExceptionFilter());

  const port = process.env.PORT || 3001;
  await app.listen(port, '0.0.0.0');
  logger.log(`Application is running on: http://localhost:${port}`);
}
bootstrap();
