import { INestApplication } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import * as request from 'supertest';
import { RefreshToken } from '../src/auth/refresh-token.entity';
import { TokenCleanupService } from '../src/auth/token-cleanup.service';
import { User } from '../src/users/user.entity';
import { createTestApp } from './utils/create-test-app';

const HOUR = 60 * 60 * 1000;

describe('Refresh token cleanup (e2e)', () => {
  let app: INestApplication;
  let tokens: Repository<RefreshToken>;
  let cleanup: TokenCleanupService;
  let user: User;

  beforeAll(async () => {
    app = await createTestApp();
    tokens = app.get(getRepositoryToken(RefreshToken));
    cleanup = app.get(TokenCleanupService);

    const res = await request(app.getHttpServer())
      .post('/users/register')
      .send({ email: 'cleanup@example.com', password: 'Valid-passw0rd' })
      .expect(201);
    user = { id: res.body.id } as User;
  });

  afterAll(async () => {
    await app.close();
  });

  async function addToken(expiresInMs: number, revoked: boolean) {
    const jti = uuidv4();
    await tokens.save(
      tokens.create({
        jti,
        user,
        revoked,
        expiresAt: new Date(Date.now() + expiresInMs),
      }),
    );
    return jti;
  }

  it('deletes expired tokens and keeps unexpired ones, including revoked', async () => {
    const expired = await addToken(-HOUR, false);
    const expiredRevoked = await addToken(-HOUR, true);
    const activeRevoked = await addToken(HOUR, true);
    const active = await addToken(HOUR, false);

    const deleted = await cleanup.deleteExpired();

    expect(deleted).toBe(2);
    const remaining = (await tokens.find()).map((t) => t.jti).sort();
    expect(remaining).toEqual([activeRevoked, active].sort());
    expect(remaining).not.toContain(expired);
    expect(remaining).not.toContain(expiredRevoked);
  });

  it('returns 0 when nothing has expired', async () => {
    await expect(cleanup.deleteExpired()).resolves.toBe(0);
  });

  it('never lets the cron handler throw', async () => {
    jest
      .spyOn(cleanup, 'deleteExpired')
      .mockRejectedValueOnce(new Error('db down'));
    jest.spyOn(cleanup['logger'], 'error').mockImplementation(() => undefined);

    await expect(cleanup.handleCron()).resolves.toBeUndefined();
  });
});
