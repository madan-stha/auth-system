import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { Role } from './roles/role.enum';

/** The authenticated user, as decoded from a valid access token. */
export interface AuthUser {
  id: number;
  email: string;
  role: Role;
  /** Session (refresh-token family) this access token belongs to. */
  sessionId?: string;
}

/** Claims carried in an access token. */
export interface AccessTokenPayload {
  sub: number;
  email: string;
  role: Role;
  /** Session id; absent in tokens issued before sessions existed. */
  sid?: string;
}

/** Injects the authenticated user (set by JwtAuthGuard) into a handler. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser =>
    ctx.switchToHttp().getRequest().user,
);
