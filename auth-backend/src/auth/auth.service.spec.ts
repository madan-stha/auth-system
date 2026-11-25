import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Response } from 'express';
import * as bcrypt from 'bcrypt';
import {
  AuthService,
  hashJti,
  REFRESH_COOKIE,
  REFRESH_COOKIE_PATH,
} from './auth.service';
import { RefreshToken } from './refresh-token.entity';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { Role } from './roles/role.enum';

const CONFIG: Record<string, unknown> = {
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'r'.repeat(32),
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL_DAYS: 7,
  REFRESH_REUSE_GRACE_SECONDS: 10,
};

const user = {
  id: 1,
  email: 'u@example.com',
  name: 'U',
  role: Role.USER,
} as User;

function makeToken(overrides: Partial<RefreshToken> = {}): RefreshToken {
  return {
    id: 7,
    jtiHash: hashJti('jti-1'),
    familyId: 'family-1',
    user,
    revoked: false,
    revokedAt: null,
    expiresAt: new Date(Date.now() + 60_000),
    sessionStartedAt: new Date('2026-01-01T00:00:00Z'),
    userAgent: 'Browser',
    ip: '127.0.0.1',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    ...overrides,
  };
}

describe('AuthService', () => {
  const jwt = new JwtService();
  let repo: jest.Mocked<
    Pick<
      Repository<RefreshToken>,
      'findOne' | 'find' | 'update' | 'save' | 'create'
    >
  >;
  let users: jest.Mocked<Pick<UsersService, 'findByEmailWithPassword'>>;
  let service: AuthService;
  let res: jest.Mocked<Pick<Response, 'cookie' | 'clearCookie'>>;

  const refreshCookie = (claims: Record<string, unknown> = {}) =>
    jwt.sign(
      { sub: 1, jti: 'jti-1', sid: 'family-1', ...claims },
      { secret: CONFIG.JWT_REFRESH_SECRET as string },
    );

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      find: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      save: jest.fn(async (t) => t),
      create: jest.fn((t) => t as RefreshToken),
    } as never;
    users = { findByEmailWithPassword: jest.fn() };
    res = { cookie: jest.fn(), clearCookie: jest.fn() } as never;

    const config = {
      getOrThrow: (key: string) => CONFIG[key],
    } as unknown as ConfigService;
    service = new AuthService(
      users as unknown as UsersService,
      jwt,
      config,
      repo as unknown as Repository<RefreshToken>,
    );
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('validateUser', () => {
    it('returns the user without the password hash for valid credentials', async () => {
      const hash = await bcrypt.hash('Secret-1', 4);
      users.findByEmailWithPassword.mockResolvedValue({
        ...user,
        password: hash,
      } as User);

      const result = await service.validateUser(user.email, 'Secret-1');

      expect(result.id).toBe(1);
      expect(result).not.toHaveProperty('password');
    });

    it('rejects a wrong password', async () => {
      const hash = await bcrypt.hash('Secret-1', 4);
      users.findByEmailWithPassword.mockResolvedValue({
        ...user,
        password: hash,
      } as User);

      await expect(service.validateUser(user.email, 'nope')).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });

    it('still runs bcrypt for an unknown email (constant timing)', async () => {
      users.findByEmailWithPassword.mockResolvedValue(null);
      const compare = jest.spyOn(bcrypt, 'compare');

      await expect(
        service.validateUser('nobody@example.com', 'x'),
      ).rejects.toThrow(new UnauthorizedException('Invalid credentials'));
      expect(compare).toHaveBeenCalledWith('x', expect.stringMatching(/^\$2/));
    });
  });

  describe('login', () => {
    it('starts a new session and returns the access token and user', async () => {
      const result = await service.login(user, res as unknown as Response, {
        userAgent: 'Firefox',
        ip: '10.0.0.1',
      });

      expect(result.user).toEqual({
        id: 1,
        email: user.email,
        name: 'U',
        role: Role.USER,
      });
      const access = jwt.verify(result.access_token, {
        secret: CONFIG.JWT_ACCESS_SECRET as string,
      });
      expect(access).toMatchObject({ sub: 1, role: Role.USER });

      const saved = repo.save.mock.calls[0][0] as RefreshToken;
      expect(saved.familyId).toBe(access.sid);
      expect(saved.userAgent).toBe('Firefox');
      expect(saved.ip).toBe('10.0.0.1');
      expect(saved.jtiHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('sets the refresh cookie as httpOnly, strict and scoped to the refresh route', async () => {
      await service.login(user, res as unknown as Response);

      expect(res.cookie).toHaveBeenCalledWith(
        REFRESH_COOKIE,
        expect.any(String),
        expect.objectContaining({
          httpOnly: true,
          sameSite: 'strict',
          path: REFRESH_COOKIE_PATH,
          maxAge: 7 * 24 * 60 * 60 * 1000,
        }),
      );
    });

    it('stores the jti only as a hash', async () => {
      await service.login(user, res as unknown as Response);

      const cookie = res.cookie.mock.calls[0][1] as string;
      const { jti } = jwt.decode(cookie) as { jti: string };
      const saved = repo.save.mock.calls[0][0] as RefreshToken;
      expect(saved.jtiHash).toBe(hashJti(jti));
      expect(JSON.stringify(saved)).not.toContain(jti);
    });

    it('truncates an oversized user agent', async () => {
      await service.login(user, res as unknown as Response, {
        userAgent: 'x'.repeat(500),
      });
      const saved = repo.save.mock.calls[0][0] as RefreshToken;
      expect(saved.userAgent).toHaveLength(255);
    });
  });

  describe('refreshTokens', () => {
    const refresh = (cookie: string) =>
      service.refreshTokens(cookie, res as unknown as Response);

    it('rejects a missing cookie', async () => {
      await expect(refresh('')).rejects.toThrow(
        new UnauthorizedException('No refresh token'),
      );
    });

    it('rejects a token signed with the wrong secret', async () => {
      const forged = jwt.sign({ sub: 1, jti: 'x' }, { secret: 'w'.repeat(32) });
      await expect(refresh(forged)).rejects.toThrow(
        new UnauthorizedException('Invalid or expired refresh token'),
      );
    });

    it('rejects a token without a jti', async () => {
      await expect(refresh(refreshCookie({ jti: undefined }))).rejects.toThrow(
        BadRequestException,
      );
    });

    it('rejects an unknown token', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(refresh(refreshCookie())).rejects.toThrow(
        new UnauthorizedException('Refresh token not found'),
      );
    });

    it('rejects a token past its database expiry', async () => {
      repo.findOne.mockResolvedValue(
        makeToken({ expiresAt: new Date(Date.now() - 1000) }),
      );
      await expect(refresh(refreshCookie())).rejects.toThrow(
        new UnauthorizedException('Refresh token expired'),
      );
    });

    it('looks the token up by the hash of its jti', async () => {
      repo.findOne.mockResolvedValue(makeToken());
      await refresh(refreshCookie());

      expect(repo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { jtiHash: hashJti('jti-1') } }),
      );
    });

    it('claims the token atomically and rotates within the same family', async () => {
      const token = makeToken();
      repo.findOne.mockResolvedValue(token);

      const result = await refresh(refreshCookie());

      expect(repo.update).toHaveBeenCalledWith(
        { id: 7, revoked: false },
        expect.objectContaining({ revoked: true, revokedAt: expect.any(Date) }),
      );
      expect(repo.save).toHaveBeenCalledWith(
        expect.objectContaining({
          familyId: 'family-1',
          sessionStartedAt: token.sessionStartedAt,
          revoked: false,
        }),
      );
      expect(result.access_token).toEqual(expect.any(String));
    });

    it('rejects a refresh that loses the race to claim the token', async () => {
      repo.findOne.mockResolvedValue(makeToken()); // looked active when read...
      repo.update.mockResolvedValue({ affected: 0 } as never); // ...but was claimed meanwhile

      await expect(refresh(refreshCookie())).rejects.toThrow(
        new UnauthorizedException('Refresh token already used'),
      );
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('revokes the whole family when a token is reused after the grace window', async () => {
      repo.findOne.mockResolvedValue(
        makeToken({ revoked: true, revokedAt: new Date(Date.now() - 60_000) }),
      );

      await expect(refresh(refreshCookie())).rejects.toThrow(
        new UnauthorizedException('Refresh token reuse detected'),
      );
      expect(repo.update).toHaveBeenCalledWith(
        { familyId: 'family-1', revoked: false },
        expect.objectContaining({ revoked: true }),
      );
      expect(service['logger'].warn).toHaveBeenCalled();
    });

    it('treats a revoked token without revokedAt as reuse (legacy rows)', async () => {
      repo.findOne.mockResolvedValue(
        makeToken({ revoked: true, revokedAt: null }),
      );
      await expect(refresh(refreshCookie())).rejects.toThrow(
        'Refresh token reuse detected',
      );
    });

    it('does not revoke the family for a reuse inside the grace window', async () => {
      repo.findOne.mockResolvedValue(
        makeToken({ revoked: true, revokedAt: new Date(Date.now() - 2_000) }),
      );

      await expect(refresh(refreshCookie())).rejects.toThrow(
        new UnauthorizedException('Refresh token already used'),
      );
      expect(repo.update).not.toHaveBeenCalled();
    });
  });

  describe('logout', () => {
    it('revokes only the current session, scoped to the user', async () => {
      await service.logout(1, 'family-1', res as unknown as Response);

      expect(repo.update).toHaveBeenCalledWith(
        { familyId: 'family-1', revoked: false, user: { id: 1 } },
        expect.objectContaining({ revoked: true }),
      );
      expect(res.clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, {
        path: REFRESH_COOKIE_PATH,
      });
    });

    it('revokes every session for access tokens without a session id', async () => {
      await service.logout(1, undefined, res as unknown as Response);

      expect(repo.update).toHaveBeenCalledWith(
        { user: { id: 1 }, revoked: false },
        expect.objectContaining({ revoked: true }),
      );
    });

    it('logoutAll revokes every session and reports how many', async () => {
      repo.update.mockResolvedValue({ affected: 3 } as never);

      const result = await service.logoutAll(1, res as unknown as Response);

      expect(result).toEqual({
        message: 'Logged out of all sessions',
        revokedSessions: 3,
      });
      expect(res.clearCookie).toHaveBeenCalled();
    });
  });

  describe('sessions', () => {
    it('lists active sessions and marks the current one', async () => {
      repo.find.mockResolvedValue([
        makeToken({ familyId: 'family-1' }),
        makeToken({ familyId: 'family-2', userAgent: null, ip: null }),
      ]);

      const sessions = await service.listSessions(1, 'family-2');

      expect(sessions).toEqual([
        expect.objectContaining({ id: 'family-1', current: false }),
        expect.objectContaining({
          id: 'family-2',
          current: true,
          userAgent: null,
          ip: null,
        }),
      ]);
      expect(sessions[0]).toEqual({
        id: 'family-1',
        current: false,
        startedAt: new Date('2026-01-01T00:00:00Z'),
        lastActiveAt: new Date('2026-01-02T00:00:00Z'),
        expiresAt: expect.any(Date),
        userAgent: 'Browser',
        ip: '127.0.0.1',
      });
    });

    it('revokes a session that belongs to the user', async () => {
      await expect(
        service.revokeSession(1, 'family-1'),
      ).resolves.toBeUndefined();
      expect(repo.update).toHaveBeenCalledWith(
        { familyId: 'family-1', revoked: false, user: { id: 1 } },
        expect.anything(),
      );
    });

    it('returns 404 for a session that is not the user’s or not active', async () => {
      repo.update.mockResolvedValue({ affected: 0 } as never);
      await expect(service.revokeSession(1, 'family-x')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
