import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-test-app';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('Hello World!');
  });

  it.each([
    ['unknown route', 'get', '/does-not-exist', 404, 'Not Found'],
    ['missing token', 'get', '/users/me', 401, 'Unauthorized'],
    ['invalid body', 'post', '/auth/login', 400, 'Bad Request'],
  ] as const)(
    'returns the standard error shape for %s',
    async (_case, method, path, statusCode, error) => {
      const res = await request(app.getHttpServer())[method](path).send({});

      expect(res.status).toBe(statusCode);
      expect(res.body).toEqual({
        statusCode,
        error,
        message: expect.anything(),
        path,
        timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
      });
    },
  );
});
