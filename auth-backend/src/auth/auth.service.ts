import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { UsersService } from '../users/users.service';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
// const { v4: uuidv4 } = require('uuid');

@Injectable()
export class AuthService {
  constructor(
    private usersService: UsersService,
    private jwtService: JwtService,
    @InjectRepository(RefreshToken)
    private refreshRepo: Repository<RefreshToken>,
  ) {}

  // validate user credentials
  async validateUser(email: string, password: string) {
    const user = await this.usersService.findByEmail(email);
    if (!user) throw new UnauthorizedException('Invalid credentials');
    // password check performed in previous UsersService or here with bcrypt
    const isMatch = await require('bcrypt').compare(password, user.password);
    if (!isMatch) throw new UnauthorizedException('Invalid credentials');
    return user;
  }

  // on login: create access token + refresh token (with DB record)
  async login(user, res: Response) {
    const payload = { sub: user.id, email: user.email };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: '15m',
      secret: 'secretKey',
    });

    // create jti and store refresh token record
    const jti = uuidv4();
    const refreshPayload = { sub: user.id, email: user.email, jti };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: '7d',
      secret: 'secretKey',
    });

    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const tokenRecord = this.refreshRepo.create({
      jti,
      user,
      expiresAt,
      revoked: false,
    });
    await this.refreshRepo.save(tokenRecord);

    // set secure cookie (path limited to refresh route)
    res.cookie('refresh_token', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      access_token: accessToken,
      user: { id: user.id, email: user.email },
    };
  }

  // refresh tokens: validate cookie, check DB, rotate refresh token
  async refreshTokens(refreshTokenFromCookie: string, res: Response) {
    if (!refreshTokenFromCookie)
      throw new UnauthorizedException('No refresh token');

    let payload: any;
    try {
      payload = this.jwtService.verify(refreshTokenFromCookie, {
        secret: 'secretKey',
      });
    } catch (err) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }

    const { sub: userId, jti } = payload;
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

    // rotation: revoke old record and create new jti+record + cookie
    tokenRecord.revoked = true;
    await this.refreshRepo.save(tokenRecord);

    const user = tokenRecord.user;
    const newJti = uuidv4();
    const newRefreshPayload = { sub: user.id, email: user.email, jti: newJti };

    const newRefreshToken = this.jwtService.sign(newRefreshPayload, {
      expiresIn: '7d',
      secret: 'secretKey',
    });

    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const newRecord = this.refreshRepo.create({
      jti: newJti,
      user,
      expiresAt: newExpiresAt,
      revoked: false,
    });
    await this.refreshRepo.save(newRecord);

    const newAccessToken = this.jwtService.sign(
      { sub: user.id, email: user.email },
      {
        expiresIn: '15m',
        secret: 'secretKey',
      },
    );

    res.cookie('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: '/auth/refresh',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { access_token: newAccessToken };
  }

  async logout(userId: number, res: Response) {
    await this.refreshRepo.update({ user: { id: userId } }, { revoked: true });
    res.clearCookie('refresh_token', { path: '/auth/refresh' });
    return { message: 'Logged out' };
  }

  async revokeTokenByJti(jti: string) {
    await this.refreshRepo.update({ jti }, { revoked: true });
  }
}
