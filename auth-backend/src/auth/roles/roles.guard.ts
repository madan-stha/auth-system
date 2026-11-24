import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthUser } from '../auth-user';
import { Role } from './role.enum';
import { ROLES_KEY } from './roles.decorator';

/**
 * Allows the request only if the authenticated user has one of the roles
 * listed with @Roles(). Routes without @Roles() are not restricted.
 * Must run after JwtAuthGuard, which sets request.user.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[] | undefined>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required || required.length === 0) return true;

    const user: AuthUser | undefined = context.switchToHttp().getRequest().user;
    if (user && required.includes(user.role)) return true;

    throw new ForbiddenException('You do not have permission to do this');
  }
}
