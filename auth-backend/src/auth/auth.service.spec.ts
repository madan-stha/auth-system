import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Repository } from 'typeorm';
import { Response } from 'express';
import { AuthService, hashJti } from './auth.service';
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

describe('AuthService.refreshTokens', () => {
  const user = { id: 1, email: 'u@example.com', role: Role.USER } as User;
  const jwt = new JwtService();
  let repo: jest.Mocked<
    Pick<Repository<RefreshToken>, 'findOne' | 'update' | 'save' | 'create'>
  >;
  let service: AuthService;
  const res = { cookie: jest.fn() } as unknown as Response;

  function token(overrides: Partial<RefreshToken> = {}): RefreshToken {
    return {
      id: 7,
      jtiHash: hashJti('jti-1'),
      familyId: 'family-1',
      user,
      revoked: false,
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      sessionStartedAt: new Date(),
      userAgent: null,
      ip: null,
      createdAt: new Date(),
      ...overrides,
    };
  }

  const cookie = () =>
    jwt.sign(
      { sub: 1, jti: 'jti-1', sid: 'family-1' },
      { secret: CONFIG.JWT_REFRESH_SECRET as string },
    );

  beforeEach(() => {
    repo = {
      findOne: jest.fn(),
      update: jest.fn(),
      save: jest.fn(async (t) => t),
      create: jest.fn((t) => t as RefreshToken),
    } as never;
    const config = {
      getOrThrow: (key: string) => CONFIG[key],
    } as unknown as ConfigService;
    service = new AuthService(
      {} as UsersService,
      jwt,
      config,
      repo as unknown as Repository<RefreshToken>,
    );
  });

  it('looks the token up by the hash of its jti', async () => {
    repo.findOne.mockResolvedValue(token());
    repo.update.mockResolvedValue({ affected: 1 } as never);

    await service.refreshTokens(cookie(), res);

    expect(repo.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { jtiHash: hashJti('jti-1') } }),
    );
  });

  it('claims the token with a conditional update and keeps the family', async () => {
    repo.findOne.mockResolvedValue(token());
    repo.update.mockResolvedValue({ affected: 1 } as never);

    const result = await service.refreshTokens(cookie(), res);

    expect(repo.update).toHaveBeenCalledWith(
      { id: 7, revoked: false },
      expect.objectContaining({ revoked: true }),
    );
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ familyId: 'family-1', revoked: false }),
    );
    expect(result.access_token).toEqual(expect.any(String));
  });

  it('rejects a refresh that loses the race to claim the token', async () => {
    repo.findOne.mockResolvedValue(token()); // looked active when read...
    repo.update.mockResolvedValue({ affected: 0 } as never); // ...but another request claimed it

    await expect(service.refreshTokens(cookie(), res)).rejects.toThrow(
      new UnauthorizedException('Refresh token already used'),
    );
    expect(repo.save).not.toHaveBeenCalled(); // no second token issued
  });

  it('revokes the whole family when a token is reused after the grace window', async () => {
    repo.findOne.mockResolvedValue(
      token({ revoked: true, revokedAt: new Date(Date.now() - 60_000) }),
    );
    repo.update.mockResolvedValue({ affected: 1 } as never);
    jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await expect(service.refreshTokens(cookie(), res)).rejects.toThrow(
      new UnauthorizedException('Refresh token reuse detected'),
    );
    expect(repo.update).toHaveBeenCalledWith(
      { familyId: 'family-1', revoked: false },
      expect.objectContaining({ revoked: true }),
    );
  });

  it('does not revoke the family for a reuse inside the grace window', async () => {
    repo.findOne.mockResolvedValue(
      token({ revoked: true, revokedAt: new Date(Date.now() - 2_000) }),
    );

    await expect(service.refreshTokens(cookie(), res)).rejects.toThrow(
      new UnauthorizedException('Refresh token already used'),
    );
    expect(repo.update).not.toHaveBeenCalled();
  });
});
