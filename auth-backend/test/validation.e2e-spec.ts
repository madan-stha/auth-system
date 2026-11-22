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

    it.each([
      ['empty', ''],
      ['blank', '   '],
    ])(
      'accepts an %s name as "not provided" (the form sends "")',
      async (_case, name) => {
        const res = await http
          .post('/users/register')
          .send({ ...valid, email: `noname-${_case}@example.com`, name });

        expect(res.status).toBe(201);
        expect(res.body.name ?? null).toBeNull();
      },
    );

    it('trims the name', async () => {
      const res = await http
        .post('/users/register')
        .send({ ...valid, email: 'trim@example.com', name: '  Sam  ' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Sam');
    });
  });

  describe('duplicate accounts', () => {
    const dupe = { email: 'dupe@example.com', password: 'Valid-passw0rd' };

    beforeAll(async () => {
      await http.post('/users/register').send(dupe).expect(201);
    });

    it('returns 409 Conflict for an email that is already registered', async () => {
      const res = await http.post('/users/register').send(dupe);

      expect(res.status).toBe(409);
      expect(res.body.message).toBe(
        'An account with this email already exists',
      );
    });

    it('treats different casing as the same email', async () => {
      const res = await http
        .post('/users/register')
        .send({ ...dupe, email: 'DUPE@Example.com' });

      expect(res.status).toBe(409);
    });

    it('creates exactly one account when the same email signs up concurrently', async () => {
      const body = { email: 'race@example.com', password: 'Valid-passw0rd' };
      const results = await Promise.all(
        Array.from({ length: 5 }, () =>
          http.post('/users/register').send(body),
        ),
      );
      const statuses = results.map((r) => r.status).sort();

      expect(statuses).toEqual([201, 409, 409, 409, 409]);
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
