import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createTestApp } from './utils/create-test-app';

/** Returns "refresh_token=<jwt>" from a response's Set-Cookie header. */
function getRefreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('No refresh_token cookie in response');
  return cookie.split(';')[0];
}

function getRawSetCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  return cookies.find((c) => c.startsWith('refresh_token=')) ?? '';
}

describe('Auth flow (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;

  const credentials = {
    email: 'jane@example.com',
    password: 'Sup3r-secret!',
    name: 'Jane',
  };

  beforeAll(async () => {
    app = await createTestApp();
    http = request(app.getHttpServer());
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers a new user', async () => {
    const res = await http.post('/users/register').send(credentials);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      id: expect.any(Number),
      email: credentials.email,
      name: credentials.name,
    });
  });

  it.todo('never returns the password hash (roadmap Day 2)');

  it('rejects a wrong password', async () => {
    const res = await http
      .post('/auth/login')
      .send({ email: credentials.email, password: 'wrong-password' });

    expect(res.status).toBe(401);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('rejects an unknown email with the same message', async () => {
    const res = await http
      .post('/auth/login')
      .send({ email: 'nobody@example.com', password: 'whatever' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid credentials');
  });

  describe('after logging in', () => {
    let accessToken: string;
    let refreshCookie: string;

    beforeAll(async () => {
      const res = await http
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password });

      expect(res.status).toBe(201);
      accessToken = res.body.access_token;
      refreshCookie = getRefreshCookie(res);
    });

    it('returns an access token and the user', async () => {
      expect(accessToken).toEqual(expect.any(String));
    });

    it('sets the refresh token as an httpOnly, strict cookie scoped to /auth/refresh', async () => {
      const res = await http
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password });
      const raw = getRawSetCookie(res);

      expect(raw).toMatch(/HttpOnly/i);
      expect(raw).toMatch(/SameSite=Strict/i);
      expect(raw).toMatch(/Path=\/auth\/refresh/);
    });

    it('allows /users/me with the access token', async () => {
      const res = await http
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(credentials.email);
    });

    it('blocks /users/me without a token', async () => {
      const res = await http.get('/users/me');
      expect(res.status).toBe(401);
    });

    it('does not accept a refresh token as an access token', async () => {
      const refreshJwt = refreshCookie.split('=')[1];
      const res = await http
        .get('/users/me')
        .set('Authorization', `Bearer ${refreshJwt}`);

      expect(res.status).toBe(401);
    });

    it('rejects /auth/refresh without a cookie', async () => {
      const res = await http.post('/auth/refresh');
      expect(res.status).toBe(401);
    });

    it('rotates the refresh token and rejects the old one', async () => {
      const first = await http
        .post('/auth/refresh')
        .set('Cookie', refreshCookie);

      expect(first.status).toBe(201);
      expect(first.body.access_token).toEqual(expect.any(String));
      const rotatedCookie = getRefreshCookie(first);
      expect(rotatedCookie).not.toBe(refreshCookie);

      // the new access token works
      const me = await http
        .get('/users/me')
        .set('Authorization', `Bearer ${first.body.access_token}`);
      expect(me.status).toBe(200);

      // the old refresh token was revoked by rotation
      const replay = await http
        .post('/auth/refresh')
        .set('Cookie', refreshCookie);
      expect(replay.status).toBe(401);
      expect(replay.body.message).toBe('Refresh token revoked');

      refreshCookie = rotatedCookie;
    });

    it('logs out, clears the cookie and revokes refresh tokens', async () => {
      const res = await http
        .post('/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(201);
      expect(getRawSetCookie(res)).toMatch(/refresh_token=;/);

      const afterLogout = await http
        .post('/auth/refresh')
        .set('Cookie', refreshCookie);
      expect(afterLogout.status).toBe(401);
    });
  });
});
