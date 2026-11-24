import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from './role.enum';
import { RolesGuard } from './roles.guard';

function contextWith(user?: { role: Role }): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  afterEach(() => jest.restoreAllMocks());

  function requireRoles(roles: Role[] | undefined) {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  }

  it('allows routes without @Roles()', () => {
    requireRoles(undefined);
    expect(guard.canActivate(contextWith({ role: Role.USER }))).toBe(true);
  });

  it('allows a user whose role is listed', () => {
    requireRoles([Role.ADMIN]);
    expect(guard.canActivate(contextWith({ role: Role.ADMIN }))).toBe(true);
  });

  it('rejects a user whose role is not listed with 403', () => {
    requireRoles([Role.ADMIN]);
    expect(() => guard.canActivate(contextWith({ role: Role.USER }))).toThrow(
      ForbiddenException,
    );
  });

  it('rejects when there is no authenticated user', () => {
    requireRoles([Role.ADMIN]);
    expect(() => guard.canActivate(contextWith(undefined))).toThrow(
      ForbiddenException,
    );
  });
});
