import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-test-app';

describe('Input validation (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  const valid = {
    email: 'sam@example.com',
    password: 'Valid-passw0rd',
    name: 'Sam',
  };

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /users/register', () => {
    it.each([
      ['missing email', { ...valid, email: undefined }, 'email'],
      ['invalid email', { ...valid, email: 'not-an-email' }, 'email'],
      ['missing password', { ...valid, password: undefined }, 'password'],
      ['password too short', { ...valid, password: 'Ab1' }, 'password'],
      [
        'password over 72 characters',
        { ...valid, password: 'Aa1' + 'x'.repeat(70) },
        'password',
      ],
      [
        'password without uppercase',
        { ...valid, password: 'lowercase1' },
        'password',
      ],
      [
        'password without a number',
        { ...valid, password: 'NoNumbersHere' },
        'password',
      ],
      ['non-string name', { ...valid, name: 123 }, 'name'],
    ])('rejects %s with 400', async (_case, body, field) => {
      const res = await http.post('/users/register').send(body);

      expect(res.status).toBe(400);
      const messages = [].concat(res.body.message).join(' ');
      expect(messages).toContain(field);
    });

    it('rejects unknown fields instead of silently saving them', async () => {
      const res = await http
        .post('/users/register')
        .send({ ...valid, role: 'ADMIN' });

      expect(res.status).toBe(400);
      expect([].concat(res.body.message).join(' ')).toContain(
        'property role should not exist',
      );
    });

    it('normalizes the email (trim + lowercase)', async () => {
      const res = await http
        .post('/users/register')
        .send({ ...valid, email: '  Sam@Example.COM ' });

      expect(res.status).toBe(201);
      expect(res.body.email).toBe('sam@example.com');

      // and the normalized form logs in, whatever casing is typed
      const login = await http
        .post('/auth/login')
        .send({ email: 'SAM@example.com', password: valid.password });
      expect(login.status).toBe(201);
    });
  });

  describe('POST /auth/login', () => {
    it('rejects an invalid email with 400', async () => {
      const res = await http
        .post('/auth/login')
        .send({ email: 'nope', password: 'x' });
      expect(res.status).toBe(400);
    });

    it('rejects an empty password with 400', async () => {
      const res = await http
        .post('/auth/login')
        .send({ email: valid.email, password: '' });
      expect(res.status).toBe(400);
    });
  });
});
