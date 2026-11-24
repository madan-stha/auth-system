import {
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { MoreThan, Repository } from 'typeorm';
import { Response } from 'express';
import { createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import { UsersService } from '../users/users.service';
import { User } from '../users/user.entity';
import { RefreshToken } from './refresh-token.entity';
import { AccessTokenPayload } from './auth-user';

export const REFRESH_COOKIE = 'refresh_token';
export const REFRESH_COOKIE_PATH = '/auth/refresh';

const DAY_MS = 24 * 60 * 60 * 1000;

// bcrypt hash (cost 10) of a random string that is not anyone's password.
// Compared against when the email is unknown, to keep timing constant.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(uuidv4(), 10);

/** Where a request came from, recorded on the session. */
export interface ClientInfo {
  userAgent?: string | null;
  ip?: string | null;
}

/** An active session (token family) as shown to its owner. */
export interface SessionView {
  id: string;
  current: boolean;
  startedAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
  userAgent: string | null;
  ip: string | null;
}

interface RefreshTokenPayload {
  sub: number;
  jti?: string;
  sid?: string;
}

/** The token's id is stored only as a SHA-256 hash. */
export function hashJti(jti: string): string {
  return createHash('sha256').update(jti).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: JwtSignOptions['expiresIn'];
  private readonly refreshTtlDays: number;
  private readonly reuseGraceMs: number;

  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    config: ConfigService,
    @InjectRepository(RefreshToken)
    private refreshRepo: Repository<RefreshToken>,
  ) {
    this.accessSecret = config.getOrThrow<string>('JWT_ACCESS_SECRET');
    this.refreshSecret = config.getOrThrow<string>('JWT_REFRESH_SECRET');
    this.accessTtl =
      config.getOrThrow<JwtSignOptions['expiresIn']>('JWT_ACCESS_TTL');
    this.refreshTtlDays = config.getOrThrow<number>('JWT_REFRESH_TTL_DAYS');
    this.reuseGraceMs =
      config.getOrThrow<number>('REFRESH_REUSE_GRACE_SECONDS') * 1000;
  }

  // validate user credentials
  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmailWithPassword(email);
    // Always run bcrypt, even for unknown emails, so response time doesn't
    // reveal which emails have accounts.
    const isMatch = await bcrypt.compare(
      password,
      user?.password ?? DUMMY_PASSWORD_HASH,
    );
    if (!user || !isMatch)
      throw new UnauthorizedException('Invalid credentials');
    delete user.password;
    return user;
  }

  /** Login starts a new session (token family). */
  async login(user: User, res: Response, client: ClientInfo = {}) {
    const accessToken = await this.issueTokens(user, res, client, {
      familyId: uuidv4(),
      sessionStartedAt: new Date(),
    });
    return {
      access_token: accessToken,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    };
  }

  /**
   * Rotates a refresh token: the presented token is revoked and a new one is
   * issued in the same family.
   *
   * Reuse detection: presenting a token that was already rotated or revoked
   * means it may have been stolen, so the whole family (session) is revoked.
   * A token reused within REFRESH_REUSE_GRACE_SECONDS of being rotated is
   * only rejected, because that is usually a harmless race (two tabs or two
   * requests refreshing at the same moment), not theft.
   */
  async refreshTokens(
    refreshTokenFromCookie: string,
    res: Response,
    client: ClientInfo = {},
  ) {
    if (!refreshTokenFromCookie)
      throw new UnauthorizedException('No refresh token');

    let payload: RefreshTokenPayload;
    try {
      payload = this.jwtService.verify(refreshTokenFromCookie, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { jti } = payload;
    if (!jti) throw new BadRequestException('Refresh token missing jti');

    const token = await this.refreshRepo.findOne({
      where: { jtiHash: hashJti(jti) },
      relations: ['user'],
    });
    if (!token) throw new UnauthorizedException('Refresh token not found');
    if (token.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException('Refresh token expired');
    if (token.revoked) return this.rejectReusedToken(token);

    // Claim the token atomically: if two requests race with the same
    // token, only one can flip revoked from false to true.
    const claim = await this.refreshRepo.update(
      { id: token.id, revoked: false },
      { revoked: true, revokedAt: new Date() },
    );
    if (!claim.affected) {
      throw new UnauthorizedException('Refresh token already used');
    }

    const accessToken = await this.issueTokens(token.user, res, client, {
      familyId: token.familyId,
      sessionStartedAt: token.sessionStartedAt,
    });
    return { access_token: accessToken };
  }

  /** Logs out the current session only. */
  async logout(userId: number, sessionId: string | undefined, res: Response) {
    if (sessionId) {
      await this.revokeFamily(sessionId, userId);
    } else {
      // Access tokens issued before sessions existed carry no session id
      await this.revokeAllSessions(userId);
    }
    this.clearRefreshCookie(res);
    return { message: 'Logged out' };
  }

  /** Logs out every session of the user, on every device. */
  async logoutAll(userId: number, res: Response) {
    const revoked = await this.revokeAllSessions(userId);
    this.clearRefreshCookie(res);
    return { message: 'Logged out of all sessions', revokedSessions: revoked };
  }

  /** The user's active sessions, most recently used first. */
  async listSessions(
    userId: number,
    currentSessionId?: string,
  ): Promise<SessionView[]> {
    const active = await this.refreshRepo.find({
      where: {
        user: { id: userId },
        revoked: false,
        expiresAt: MoreThan(new Date()),
      },
      order: { createdAt: 'DESC' },
    });

    return active.map((t) => ({
      id: t.familyId,
      current: t.familyId === currentSessionId,
      startedAt: t.sessionStartedAt,
      lastActiveAt: t.createdAt,
      expiresAt: t.expiresAt,
      userAgent: t.userAgent,
      ip: t.ip,
    }));
  }

  /** Revokes one of the user's sessions. 404 if it isn't theirs or active. */
  async revokeSession(userId: number, sessionId: string): Promise<void> {
    const revoked = await this.revokeFamily(sessionId, userId);
    if (revoked === 0) throw new NotFoundException('Session not found');
  }

  clearRefreshCookie(res: Response) {
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
  }

  private async rejectReusedToken(token: RefreshToken): Promise<never> {
    const sinceRevoked = token.revokedAt
      ? Date.now() - token.revokedAt.getTime()
      : Infinity;

    if (sinceRevoked <= this.reuseGraceMs) {
      throw new UnauthorizedException('Refresh token already used');
    }

    const revoked = await this.revokeFamily(token.familyId);
    this.logger.warn(
      `Refresh token reuse detected for user ${token.user.id}; ` +
        `revoked session ${token.familyId} (${revoked} active token(s))`,
    );
    throw new UnauthorizedException('Refresh token reuse detected');
  }

  /** Revokes every still-active token in a family. Returns how many. */
  private async revokeFamily(familyId: string, userId?: number) {
    const result = await this.refreshRepo.update(
      {
        familyId,
        revoked: false,
        ...(userId !== undefined && { user: { id: userId } }),
      },
      { revoked: true, revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }

  private async revokeAllSessions(userId: number) {
    const result = await this.refreshRepo.update(
      { user: { id: userId }, revoked: false },
      { revoked: true, revokedAt: new Date() },
    );
    return result.affected ?? 0;
  }

  /**
   * Signs a new access token and a new refresh token in the given family,
   * stores the refresh token (hashed) and sets it as an httpOnly cookie.
   * Returns the access token for the response body.
   */
  private async issueTokens(
    user: User,
    res: Response,
    client: ClientInfo,
    session: { familyId: string; sessionStartedAt: Date },
  ): Promise<string> {
    // The role is read from the DB on every login and refresh, so a role
    // change takes effect within one access-token lifetime (JWT_ACCESS_TTL).
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      sid: session.familyId,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl,
    });

    const jti = uuidv4();
    const refreshToken = this.jwtService.sign(
      { sub: user.id, jti, sid: session.familyId },
      { secret: this.refreshSecret, expiresIn: `${this.refreshTtlDays}d` },
    );

    const refreshTtlMs = this.refreshTtlDays * DAY_MS;
    await this.refreshRepo.save(
      this.refreshRepo.create({
        jtiHash: hashJti(jti),
        familyId: session.familyId,
        sessionStartedAt: session.sessionStartedAt,
        user,
        expiresAt: new Date(Date.now() + refreshTtlMs),
        revoked: false,
        revokedAt: null,
        userAgent: client.userAgent?.slice(0, 255) ?? null,
        ip: client.ip?.slice(0, 45) ?? null,
      }),
    );

    // secure cookie, only sent to the refresh route
    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: REFRESH_COOKIE_PATH,
      maxAge: refreshTtlMs,
    });

    return accessToken;
  }
}
