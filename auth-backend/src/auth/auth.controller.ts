import { Controller, Post, Body, Res, Req, UseGuards } from '@nestjs/common';
import { AuthService, REFRESH_COOKIE } from './auth.service';
import { Request, Response } from 'express';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { LoginDto } from './dto/login.dto';
import { AuthUser, CurrentUser } from './auth-user';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  async login(
    @Body() body: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const user = await this.authService.validateUser(body.email, body.password);
    return this.authService.login(user, res);
  }

  @Post('refresh')
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    return this.authService.refreshTokens(refreshToken, res);
  }

  // Logout requires a valid access token to identify the user.
  @UseGuards(JwtAuthGuard)
  @Post('logout')
  async logout(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(user.id, res);
  }
}
