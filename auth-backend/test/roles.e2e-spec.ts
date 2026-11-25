import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UsersService } from '../src/users/users.service';
import { Role } from '../src/auth/roles/role.enum';
import { createTestApp } from './utils/create-test-app';

describe('Roles and admin routes (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let users: UsersService;

  const password = 'Valid-passw0rd';

  async function register(email: string) {
    await http.post('/users/register').send({ email, password }).expect(201);
  }

  async function login(email: string) {
    const res = await http
      .post('/auth/login')
      .send({ email, password })
      .expect(201);
    return res.body as { access_token: string; user: { role: Role } };
  }

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
    users = app.get(UsersService);

    await register('regular@example.com');
    await register('boss@example.com');
    await users.setRole('boss@example.com', Role.ADMIN);
  });

  afterAll(async () => {
    await app.close();
  });

  it('gives new accounts the user role', async () => {
    const res = await http
      .post('/users/register')
      .send({ email: 'fresh@example.com', password })
      .expect(201);

    expect(res.body.role).toBe(Role.USER);
  });

  it('does not let a client choose its own role at sign-up', async () => {
    const res = await http
      .post('/users/register')
      .send({ email: 'sneaky@example.com', password, role: Role.ADMIN });

    expect(res.status).toBe(400);
  });

  it('includes the role in the login response', async () => {
    expect((await login('regular@example.com')).user.role).toBe(Role.USER);
    expect((await login('boss@example.com')).user.role).toBe(Role.ADMIN);
  });

  describe('GET /users/summary', () => {
    it('returns 401 without a token', async () => {
      await http.get('/users/summary').expect(401);
    });

    it('returns 403 for a regular user', async () => {
      const { access_token } = await login('regular@example.com');
      const res = await http
        .get('/users/summary')
        .set('Authorization', `Bearer ${access_token}`);

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Forbidden');
    });

    it('returns real statistics for an admin', async () => {
      const { access_token } = await login('boss@example.com');
      const res = await http
        .get('/users/summary')
        .set('Authorization', `Bearer ${access_token}`)
        .expect(200);

      expect(res.body).toEqual({
        totalUsers: 3, // regular, boss, fresh
        admins: 1,
        newUsersLast7Days: 3,
        activeSessions: expect.any(Number),
        generatedAt: expect.any(String),
      });
      // every login above created a session that is still active
      expect(res.body.activeSessions).toBeGreaterThanOrEqual(2);
    });
  });

  it('picks up a role change on the next token refresh', async () => {
    await register('promoted@example.com');
    const loginRes = await http
      .post('/auth/login')
      .send({ email: 'promoted@example.com', password })
      .expect(201);
    const cookie = [].concat(loginRes.headers['set-cookie'])[0];

    await users.setRole('promoted@example.com', Role.ADMIN);

    const refreshed = await http
      .post('/auth/refresh')
      .set('Cookie', cookie)
      .expect(201);
    await http
      .get('/users/summary')
      .set('Authorization', `Bearer ${refreshed.body.access_token}`)
      .expect(200);
  });
});
