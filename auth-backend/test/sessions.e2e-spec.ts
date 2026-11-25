import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import request from 'supertest';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { hashJti } from '../src/auth/auth.service';
import { createTestApp, TestEnv } from './utils/create-test-app';

const PASSWORD = 'Valid-passw0rd';

/** Returns "refresh_token=<jwt>" from a response's Set-Cookie header. */
function refreshCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith('refresh_token='));
  if (!cookie) throw new Error('No refresh_token cookie in response');
  return cookie.split(';')[0];
}

function decodeJwt(cookie: string): { jti: string; sid: string } {
  const jwt = cookie.split('=')[1];
  return JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString());
}

async function setup(env: TestEnv = {}) {
  const app = await createTestApp(env);
  // Listen on a real port: concurrent requests against a non-listening
  // server make supertest open overlapping temporary listeners (ECONNRESET).
  await app.listen(0);
  const http = request(await app.getUrl());

  /** Logs in from a "device" (user agent); returns its tokens. */
  async function login(email: string, device = 'test-device') {
    const res = await http
      .post('/auth/login')
      .set('User-Agent', device)
      .send({ email, password: PASSWORD })
      .expect(201);
    return {
      access: res.body.access_token as string,
      cookie: refreshCookie(res),
    };
  }

  async function register(email: string) {
    await http
      .post('/users/register')
      .send({ email, password: PASSWORD })
      .expect(201);
  }

  const refresh = (cookie: string) =>
    http.post('/auth/refresh').set('Cookie', cookie);

  return { app, http, login, register, refresh };
}

describe('Refresh token reuse detection (e2e)', () => {
  describe('after the grace window (theft)', () => {
    let ctx: Awaited<ReturnType<typeof setup>>;

    beforeAll(async () => {
      ctx = await setup({ REFRESH_REUSE_GRACE_SECONDS: '0' });
      await ctx.register('theft@example.com');
    });
    afterAll(() => ctx.app.close());

    it('revokes the whole session when a rotated token is replayed', async () => {
      const { cookie: stolen } = await ctx.login('theft@example.com');

      // legitimate user refreshes: stolen token is now rotated
      const legit = await ctx.refresh(stolen).expect(201);
      const legitCookie = refreshCookie(legit);

      // attacker replays the stolen token
      const replay = await ctx.refresh(stolen);
      expect(replay.status).toBe(401);
      expect(replay.body.message).toBe('Refresh token reuse detected');

      // the session is gone: even the newest token no longer works
      const after = await ctx.refresh(legitCookie);
      expect(after.status).toBe(401);
    });

    it('leaves other sessions of the same user untouched', async () => {
      const a = await ctx.login('theft@example.com', 'laptop');
      const b = await ctx.login('theft@example.com', 'phone');

      await ctx.refresh(a.cookie).expect(201);
      await ctx.refresh(a.cookie).expect(401); // reuse: session A revoked

      await ctx.refresh(b.cookie).expect(201); // session B still fine
    });
  });

  describe('within the grace window (two tabs refreshing at once)', () => {
    let ctx: Awaited<ReturnType<typeof setup>>;

    beforeAll(async () => {
      ctx = await setup({ REFRESH_REUSE_GRACE_SECONDS: '30' });
      await ctx.register('tabs@example.com');
    });
    afterAll(() => ctx.app.close());

    it('rejects the duplicate but keeps the session', async () => {
      const { cookie } = await ctx.login('tabs@example.com');
      const first = await ctx.refresh(cookie).expect(201);

      const duplicate = await ctx.refresh(cookie);
      expect(duplicate.status).toBe(401);
      expect(duplicate.body.message).toBe('Refresh token already used');

      await ctx.refresh(refreshCookie(first)).expect(201);
    });

    it('lets exactly one of several concurrent refreshes succeed', async () => {
      const { cookie } = await ctx.login('tabs@example.com');
      const results = await Promise.all(
        Array.from({ length: 5 }, () => ctx.refresh(cookie)),
      );

      expect(results.map((r) => r.status).sort()).toEqual([
        201, 401, 401, 401, 401,
      ]);
    });
  });
});

describe('Sessions (e2e)', () => {
  let ctx: Awaited<ReturnType<typeof setup>>;
  let tokens: Repository<RefreshToken>;

  beforeAll(async () => {
    ctx = await setup();
    tokens = ctx.app.get(getRepositoryToken(RefreshToken));
    await ctx.register('multi@example.com');
    await ctx.register('other@example.com');
  });
  afterAll(() => ctx.app.close());

  const sessionsOf = (access: string) =>
    ctx.http.get('/auth/sessions').set('Authorization', `Bearer ${access}`);

  it('stores only a hash of the token id', async () => {
    const { cookie } = await ctx.login('multi@example.com');
    const { jti } = decodeJwt(cookie);

    expect(await tokens.findOneBy({ jtiHash: hashJti(jti) })).not.toBeNull();
    const raw = await tokens.query(
      'SELECT COUNT(*) AS n FROM refresh_tokens WHERE jtiHash = ?',
      [jti],
    );
    expect(Number(raw[0].n)).toBe(0);
  });

  it('lists active sessions with device info and marks the current one', async () => {
    const laptop = await ctx.login('other@example.com', 'Laptop Chrome');
    await ctx.login('other@example.com', 'Phone Safari');

    const res = await sessionsOf(laptop.access).expect(200);

    expect(res.body).toHaveLength(2);
    const current = res.body.find((s: { current: boolean }) => s.current);
    expect(current.userAgent).toBe('Laptop Chrome');
    expect(
      res.body.map((s: { userAgent: string }) => s.userAgent).sort(),
    ).toEqual(['Laptop Chrome', 'Phone Safari']);
    expect(current).toEqual({
      id: decodeJwt(laptop.cookie).sid,
      current: true,
      startedAt: expect.any(String),
      lastActiveAt: expect.any(String),
      expiresAt: expect.any(String),
      userAgent: 'Laptop Chrome',
      ip: expect.any(String),
    });
  });

  it('keeps the same session id across refreshes', async () => {
    await ctx.register('rotate@example.com');
    const { access, cookie } = await ctx.login('rotate@example.com');
    const before = (await sessionsOf(access).expect(200)).body;

    const refreshed = await ctx.refresh(cookie).expect(201);
    const after = (await sessionsOf(refreshed.body.access_token).expect(200))
      .body;

    expect(after).toHaveLength(1);
    expect(after[0].id).toBe(before[0].id);
    expect(after[0].startedAt).toBe(before[0].startedAt);
  });

  it('revokes a single other session', async () => {
    await ctx.register('lost-phone@example.com');
    const laptop = await ctx.login('lost-phone@example.com', 'laptop');
    const phone = await ctx.login('lost-phone@example.com', 'phone');
    const phoneSession = decodeJwt(phone.cookie).sid;

    await ctx.http
      .delete(`/auth/sessions/${phoneSession}`)
      .set('Authorization', `Bearer ${laptop.access}`)
      .expect(204);

    await ctx.refresh(phone.cookie).expect(401);
    await ctx.refresh(laptop.cookie).expect(201);
  });

  it("returns 404 for another user's session and 400 for a malformed id", async () => {
    const mine = await ctx.login('multi@example.com');
    const theirs = await ctx.login('other@example.com');

    await ctx.http
      .delete(`/auth/sessions/${decodeJwt(theirs.cookie).sid}`)
      .set('Authorization', `Bearer ${mine.access}`)
      .expect(404);
    await ctx.refresh(theirs.cookie).expect(201); // untouched

    await ctx.http
      .delete('/auth/sessions/not-a-uuid')
      .set('Authorization', `Bearer ${mine.access}`)
      .expect(400);
  });

  it('logout ends only the current session', async () => {
    await ctx.register('one-device@example.com');
    const laptop = await ctx.login('one-device@example.com', 'laptop');
    const phone = await ctx.login('one-device@example.com', 'phone');

    await ctx.http
      .post('/auth/logout')
      .set('Authorization', `Bearer ${laptop.access}`)
      .expect(201);

    await ctx.refresh(laptop.cookie).expect(401);
    await ctx.refresh(phone.cookie).expect(201);
  });

  it('logout-all ends every session', async () => {
    await ctx.register('everywhere@example.com');
    const laptop = await ctx.login('everywhere@example.com', 'laptop');
    const phone = await ctx.login('everywhere@example.com', 'phone');

    const res = await ctx.http
      .post('/auth/logout-all')
      .set('Authorization', `Bearer ${laptop.access}`)
      .expect(201);
    expect(res.body.revokedSessions).toBe(2);

    await ctx.refresh(laptop.cookie).expect(401);
    await ctx.refresh(phone.cookie).expect(401);
  });

  it('requires authentication for session endpoints', async () => {
    await ctx.http.get('/auth/sessions').expect(401);
    await ctx.http.post('/auth/logout-all').expect(401);
  });
});
