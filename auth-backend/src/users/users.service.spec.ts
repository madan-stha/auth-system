import { ConflictException } from '@nestjs/common';
import {
  MoreThan,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UsersService } from './users.service';
import { User } from './user.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { Role } from '../auth/roles/role.enum';

describe('UsersService', () => {
  let usersRepo: jest.Mocked<
    Pick<
      Repository<User>,
      'exists' | 'create' | 'save' | 'findOne' | 'update' | 'count'
    > & { createQueryBuilder: jest.Mock }
  >;
  let refreshRepo: jest.Mocked<Pick<Repository<RefreshToken>, 'count'>>;
  let service: UsersService;

  beforeEach(() => {
    usersRepo = {
      exists: jest.fn().mockResolvedValue(false),
      create: jest.fn((u) => u as User),
      save: jest.fn(async (u) => ({ id: 1, ...u }) as User),
      findOne: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as never;
    refreshRepo = { count: jest.fn() } as never;
    service = new UsersService(
      usersRepo as unknown as Repository<User>,
      refreshRepo as unknown as Repository<RefreshToken>,
    );
  });

  describe('create', () => {
    it('hashes the password before saving', async () => {
      const user = await service.create('a@example.com', 'Secret-1', 'A');

      const saved = usersRepo.save.mock.calls[0][0] as User;
      expect(saved.password).not.toBe('Secret-1');
      await expect(bcrypt.compare('Secret-1', saved.password)).resolves.toBe(
        true,
      );
      expect(user).toMatchObject({ id: 1, email: 'a@example.com', name: 'A' });
    });

    it('returns 409 when the email is already registered', async () => {
      usersRepo.exists.mockResolvedValue(true);

      await expect(service.create('a@example.com', 'Secret-1')).rejects.toThrow(
        new ConflictException('An account with this email already exists'),
      );
      expect(usersRepo.save).not.toHaveBeenCalled();
    });

    it.each([
      ['MySQL', { code: 'ER_DUP_ENTRY', message: 'Duplicate entry' }],
      ['SQLite', { message: 'UNIQUE constraint failed: users.email' }],
    ])(
      'maps a %s unique-constraint error (concurrent sign-up) to 409',
      async (_db, driverError) => {
        usersRepo.save.mockRejectedValue(
          new QueryFailedError('INSERT', [], driverError as unknown as Error),
        );

        await expect(
          service.create('a@example.com', 'Secret-1'),
        ).rejects.toThrow(ConflictException);
      },
    );

    it('rethrows other database errors', async () => {
      const boom = new QueryFailedError('INSERT', [], {
        code: 'ER_LOCK_DEADLOCK',
        message: 'Deadlock',
      } as unknown as Error);
      usersRepo.save.mockRejectedValue(boom);

      await expect(service.create('a@example.com', 'Secret-1')).rejects.toBe(
        boom,
      );
    });

    it('rethrows non-database errors', async () => {
      const boom = new Error('network down');
      usersRepo.save.mockRejectedValue(boom);

      await expect(service.create('a@example.com', 'Secret-1')).rejects.toBe(
        boom,
      );
    });
  });

  describe('lookups', () => {
    it('finds by email and id', async () => {
      usersRepo.findOne.mockResolvedValue({ id: 2 } as User);

      await expect(service.findByEmail('a@example.com')).resolves.toEqual({
        id: 2,
      });
      expect(usersRepo.findOne).toHaveBeenLastCalledWith({
        where: { email: 'a@example.com' },
      });

      await service.findById(2);
      expect(usersRepo.findOne).toHaveBeenLastCalledWith({ where: { id: 2 } });
    });

    it('explicitly selects the password only for credential checks', async () => {
      const qb = {
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue({ id: 3 }),
      };
      usersRepo.createQueryBuilder.mockReturnValue(qb);

      await expect(
        service.findByEmailWithPassword('a@example.com'),
      ).resolves.toEqual({ id: 3 });
      expect(qb.addSelect).toHaveBeenCalledWith('user.password');
      expect(qb.where).toHaveBeenCalledWith('user.email = :email', {
        email: 'a@example.com',
      });
    });
  });

  describe('setRole', () => {
    it('returns true when a user was updated', async () => {
      usersRepo.update.mockResolvedValue({ affected: 1 } as never);

      await expect(service.setRole('a@example.com', Role.ADMIN)).resolves.toBe(
        true,
      );
      expect(usersRepo.update).toHaveBeenCalledWith(
        { email: 'a@example.com' },
        { role: Role.ADMIN },
      );
    });

    it('returns false when no user has that email', async () => {
      usersRepo.update.mockResolvedValue({ affected: 0 } as never);
      await expect(service.setRole('x@example.com', Role.ADMIN)).resolves.toBe(
        false,
      );
    });
  });

  describe('getSummary', () => {
    it('counts users, admins, recent sign-ups and active sessions', async () => {
      const now = new Date('2026-11-25T12:00:00Z');
      const weekAgo = new Date('2026-11-18T12:00:00Z');
      usersRepo.count
        .mockResolvedValueOnce(10) // total
        .mockResolvedValueOnce(2) // admins
        .mockResolvedValueOnce(4); // last 7 days
      refreshRepo.count.mockResolvedValue(6);

      await expect(service.getSummary(now)).resolves.toEqual({
        totalUsers: 10,
        admins: 2,
        newUsersLast7Days: 4,
        activeSessions: 6,
        generatedAt: '2026-11-25T12:00:00.000Z',
      });

      expect(usersRepo.count).toHaveBeenCalledWith({
        where: { role: Role.ADMIN },
      });
      expect(usersRepo.count).toHaveBeenCalledWith({
        where: { createdAt: MoreThanOrEqual(weekAgo) },
      });
      expect(refreshRepo.count).toHaveBeenCalledWith({
        where: { revoked: false, expiresAt: MoreThan(now) },
      });
    });
  });
});
