import { Controller, Post, Body, UseGuards, Get, Req } from '@nestjs/common';
import { UsersService } from './users.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Request } from 'express';
import { RegisterDto } from './dto/register.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('register')
  async register(@Body() body: RegisterDto) {
    return this.usersService.create(body.email, body.password, body.name);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  async me(@Req() req: Request) {
    const user = req.user as any; // from JwtStrategy.validate
    return this.usersService.findById(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Get('summary')
  async getSummary() {
    return this.usersService.getSummary();
  }
}
