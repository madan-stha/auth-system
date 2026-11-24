import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  ParseUUIDPipe,
  Res,
  Req,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService, ClientInfo, REFRESH_COOKIE } from './auth.service';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { AuthUser, CurrentUser } from './auth-user';
import { AuthRateLimit } from '../common/rate-limit/rate-limit.module';

/** Browser and IP of the request, recorded on the session. */
function clientInfo(req: Request): ClientInfo {
  return { userAgent: req.get('user-agent') ?? null, ip: req.ip ?? null };
}

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @AuthRateLimit()
  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(body.email, body.password);
    return this.authService.login(user, res, clientInfo(req));
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    return this.authService.refreshTokens(refreshToken, res, clientInfo(req));
  }

  /** Logs out the current session (this device). */
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(user.id, user.sessionId, res);
  }

  /** Logs out every session of the user, on every device. */
  @UseGuards(JwtAuthGuard)
  @Post('logout-all')
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logoutAll(user.id, res);
  }

  /** The user's active sessions; `current` marks this device. */
  @UseGuards(JwtAuthGuard)
  @Get('sessions')
  async sessions(@CurrentUser() user: AuthUser) {
    return this.authService.listSessions(user.id, user.sessionId);
  }

  /** Revokes one session, e.g. a lost phone. */
  @UseGuards(JwtAuthGuard)
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async revokeSession(
    @CurrentUser() user: AuthUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.authService.revokeSession(user.id, id);
    if (id === user.sessionId) this.authService.clearRefreshCookie(res);
  }
}
