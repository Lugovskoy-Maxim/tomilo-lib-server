import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { HttpExceptionFilter } from '../src/common/filters/http-exception.filter';

/**
 * E2E тесты поднимают приложение с реальным подключением к БД.
 * Запуск: MONGO_URI=mongodb://localhost:27017/tomilo_lib_e2e npm run test:e2e
 * Без MONGO_URI используется конфиг из .env (нужны MONGO_HOST, MONGO_LOGIN и т.д.)
 */
describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe());
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /api', () => {
    it('returns Hello World!', () => {
      return request(app.getHttpServer())
        .get('/api')
        .expect(200)
        .expect('Hello World!');
    });
  });

  describe('GET /api/health', () => {
    it('returns health status', () => {
      return request(app.getHttpServer())
        .get('/api/health')
        .expect(200)
        .expect((res) => {
          expect(res.body).toMatchObject({
            status: 'ok',
            service: 'tomilo-lib-server',
          });
          expect(res.body.timestamp).toBeDefined();
          expect(typeof res.body.uptime).toBe('number');
        });
    });
  });

  describe('GET /api/stats', () => {
    it('returns stats with success wrapper', () => {
      return request(app.getHttpServer())
        .get('/api/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toBeDefined();
          expect(res.body.data).toMatchObject({
            totalTitles: expect.any(Number),
            totalChapters: expect.any(Number),
            totalUsers: expect.any(Number),
            totalCollections: expect.any(Number),
            daily: expect.any(Object),
            weekly: expect.any(Object),
            monthly: expect.any(Object),
          });
        });
    });

    it('accepts includeHistory and historyDays query params', () => {
      return request(app.getHttpServer())
        .get('/api/stats?includeHistory=true&historyDays=7')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toBeDefined();
        });
    });
  });

  describe('GET /api/stats/history', () => {
    it('returns daily history when type=daily', () => {
      return request(app.getHttpServer())
        .get('/api/stats/history?type=daily&days=5')
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(Array.isArray(res.body.data)).toBe(true);
        });
    });

    it('returns monthly history when type=monthly', () => {
      const year = new Date().getFullYear();
      const month = new Date().getMonth() + 1;
      return request(app.getHttpServer())
        .get(`/api/stats/history?type=monthly&year=${year}&month=${month}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toBeDefined();
        });
    });

    it('returns yearly history when type=yearly', () => {
      const year = new Date().getFullYear();
      return request(app.getHttpServer())
        .get(`/api/stats/history?type=yearly&year=${year}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.success).toBe(true);
          expect(res.body.data).toBeDefined();
        });
    });
  });
});
