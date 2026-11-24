import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-test-app';

describe('Rate limiting (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  const AUTH_LIMIT = 3;
  const GENERAL_LIMIT = 6;

  beforeAll(async () => {
    app = await createTestApp({
      AUTH_RATE_LIMIT_MAX: String(AUTH_LIMIT),
      RATE_LIMIT_MAX: String(GENERAL_LIMIT),
    });
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('blocks login after AUTH_RATE_LIMIT_MAX attempts with 429', async () => {
    const attempt = () =>
      http
        .post('/auth/login')
        .send({ email: 'victim@example.com', password: 'guess' });

    for (let i = 0; i < AUTH_LIMIT; i++) {
      expect((await attempt()).status).toBe(401);
    }

    const blocked = await attempt();
    expect(blocked.status).toBe(429);
    expect(blocked.headers['retry-after-auth']).toBeDefined();
    expect(blocked.body).toMatchObject({
      statusCode: 429,
      error: 'Too Many Requests',
      message: 'Too many requests, please try again later.',
      path: '/auth/login',
    });
  });

  it('applies the general limit to other routes', async () => {
    const statuses: number[] = [];
    for (let i = 0; i < GENERAL_LIMIT + 1; i++) {
      statuses.push((await http.get('/')).status);
    }

    expect(statuses.slice(0, GENERAL_LIMIT).every((s) => s === 200)).toBe(true);
    expect(statuses[GENERAL_LIMIT]).toBe(429);
  });
});

describe('Rate limiting is per route group (e2e)', () => {
  it('does not apply the strict auth limit to non-auth routes', async () => {
    const app = await createTestApp({
      AUTH_RATE_LIMIT_MAX: '1',
      RATE_LIMIT_MAX: '100',
    });
    const http = request(app.getHttpServer());

    for (let i = 0; i < 5; i++) {
      await http.get('/').expect(200);
    }
    await app.close();
  });
});
