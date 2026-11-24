import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from './roles/role.enum';

/** The authenticated user, as decoded from a valid access token. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
}

/** Claims carried in an access token. */
export interface AccessTokenPayload {
  sub: number;
  email: string;
  role: Role;
}

/** Injects the authenticated user (set by JwtAuthGuard) into a handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
