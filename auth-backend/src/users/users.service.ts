import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { User } from './user.entity';
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

@Injectable()
export class UsersService {
  constructor(@InjectRepository(User) private usersRepo: Repository<User>) {}

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

  getSummary() {
    return {
      totalUsers: 120,
      totalOrders: 45,
      revenue: 13450,
      topProduct: 'Wireless Mouse',
      updatedAt: new Date().toISOString(),
    };
  }
}
