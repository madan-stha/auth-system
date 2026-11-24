import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Response } from 'express';
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

@Injectable()
export class AuthService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessTtl: JwtSignOptions['expiresIn'];
  private readonly refreshTtlDays: number;

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

  // on login: create access token + refresh token (with DB record)
  async login(user: User, res: Response) {
    const accessToken = await this.issueTokens(user, res);
    return {
      access_token: accessToken,
      user: { id: user.id, email: user.email, role: user.role },
    };
  }

  // refresh tokens: validate cookie, check DB, rotate refresh token
  async refreshTokens(refreshTokenFromCookie: string, res: Response) {
    if (!refreshTokenFromCookie)
      throw new UnauthorizedException('No refresh token');

    let payload: { sub: number; jti?: string };
    try {
      payload = this.jwtService.verify(refreshTokenFromCookie, {
        secret: this.refreshSecret,
      });
    } catch {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { jti } = payload;
    if (!jti) throw new BadRequestException('Refresh token missing jti');

    const tokenRecord = await this.refreshRepo.findOne({
      where: { jti },
      relations: ['user'],
    });
    if (!tokenRecord)
      throw new UnauthorizedException('Refresh token not found');
    if (tokenRecord.revoked)
      throw new UnauthorizedException('Refresh token revoked');
    if (tokenRecord.expiresAt.getTime() < Date.now())
      throw new UnauthorizedException('Refresh token expired');

    // rotation: revoke the used token, then issue a fresh pair
    tokenRecord.revoked = true;
    await this.refreshRepo.save(tokenRecord);

    const accessToken = await this.issueTokens(tokenRecord.user, res);
    return { access_token: accessToken };
  }

  async logout(userId: number, res: Response) {
    await this.refreshRepo.update({ user: { id: userId } }, { revoked: true });
    res.clearCookie(REFRESH_COOKIE, { path: REFRESH_COOKIE_PATH });
    return { message: 'Logged out' };
  }

  async revokeTokenByJti(jti: string) {
    await this.refreshRepo.update({ jti }, { revoked: true });
  }

  /**
   * Signs a new access token and a new refresh token, stores the refresh
   * token's jti in the DB and sets it as an httpOnly cookie.
   * Returns the access token for the response body.
   */
  private async issueTokens(user: User, res: Response): Promise<string> {
    // The role is read from the DB on every login and refresh, so a role
    // change takes effect within one access-token lifetime (JWT_ACCESS_TTL).
    const payload: AccessTokenPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    };
    const accessToken = this.jwtService.sign(payload, {
      secret: this.accessSecret,
      expiresIn: this.accessTtl,
    });

    const jti = uuidv4();
    const refreshToken = this.jwtService.sign(
      { sub: user.id, email: user.email, jti },
      { secret: this.refreshSecret, expiresIn: `${this.refreshTtlDays}d` },
    );

    const refreshTtlMs = this.refreshTtlDays * DAY_MS;
    await this.refreshRepo.save(
      this.refreshRepo.create({
        jti,
        user,
        expiresAt: new Date(Date.now() + refreshTtlMs),
        revoked: false,
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
