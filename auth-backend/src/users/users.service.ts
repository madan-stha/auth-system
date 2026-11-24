import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  MoreThan,
  MoreThanOrEqual,
  QueryFailedError,
  Repository,
} from 'typeorm';
import { User } from './user.entity';
import { RefreshToken } from '../auth/refresh-token.entity';
import { Role } from '../auth/roles/role.enum';
import * as bcrypt from 'bcrypt';

const EMAIL_TAKEN = 'An account with this email already exists';

/** True for a unique-constraint violation (MySQL, or SQLite in tests). */
function isUniqueViolation(err: unknown): boolean {
  if (!(err instanceof QueryFailedError)) return false;
  const driverError = err.driverError as { code?: string; message?: string };
  return (
    driverError?.code === 'ER_DUP_ENTRY' ||
    /UNIQUE constraint failed/i.test(driverError?.message ?? err.message)
  );
}

export interface UsersSummary {
  totalUsers: number;
  admins: number;
  newUsersLast7Days: number;
  /** Refresh tokens that are neither revoked nor expired. */
  activeSessions: number;
  generatedAt: string;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private usersRepo: Repository<User>,
    @InjectRepository(RefreshToken)
    private refreshRepo: Repository<RefreshToken>,
  ) {}

  async create(email: string, password: string, name?: string): Promise<User> {
    if (await this.usersRepo.exists({ where: { email } })) {
      throw new ConflictException(EMAIL_TAKEN);
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = this.usersRepo.create({
      email,
      password: hashedPassword,
      name,
    });

    try {
      return await this.usersRepo.save(user);
    } catch (err) {
      // Two sign-ups with the same email at the same moment can both pass
      // the check above; the DB unique index is the final guard.
      if (isUniqueViolation(err)) throw new ConflictException(EMAIL_TAKEN);
      throw err;
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.usersRepo.findOne({ where: { email } });
  }

  /** Includes the password hash (excluded by default). Only for credential checks. */
  async findByEmailWithPassword(email: string): Promise<User | null> {
    return this.usersRepo
      .createQueryBuilder('user')
      .addSelect('user.password')
      .where('user.email = :email', { email })
      .getOne();
  }

  async findById(id: number): Promise<User | null> {
    return this.usersRepo.findOne({ where: { id } });
  }

  /** Sets a user's role. Returns false if no user has that email. */
  async setRole(email: string, role: Role): Promise<boolean> {
    const result = await this.usersRepo.update({ email }, { role });
    return (result.affected ?? 0) > 0;
  }

  /** Account and session statistics for the admin dashboard. */
  async getSummary(now: Date = new Date()): Promise<UsersSummary> {
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [totalUsers, admins, newUsersLast7Days, activeSessions] =
      await Promise.all([
        this.usersRepo.count(),
        this.usersRepo.count({ where: { role: Role.ADMIN } }),
        this.usersRepo.count({
          where: { createdAt: MoreThanOrEqual(weekAgo) },
        }),
        this.refreshRepo.count({
          where: { revoked: false, expiresAt: MoreThan(now) },
        }),
      ]);

    return {
      totalUsers,
      admins,
      newUsersLast7Days,
      activeSessions,
      generatedAt: now.toISOString(),
    };
  }
}
