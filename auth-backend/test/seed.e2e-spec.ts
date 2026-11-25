import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { UsersService } from '../src/users/users.service';
import {
  ADMIN_EMAIL,
  DEMO_USER,
  generatePassword,
  seedUsers,
} from '../src/database/seeds/seed-users';
import { RegisterDto } from '../src/users/dto/register.dto';
import { Role } from '../src/auth/roles/role.enum';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { createTestApp } from './utils/create-test-app';

describe('Seed users (e2e)', () => {
  let app: INestApplication;
  let users: UsersService;

  beforeAll(async () => {
    app = await createTestApp();
    users = app.get(UsersService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates the demo and admin users, generating an admin password', async () => {
    const results = await seedUsers(users);

    expect(results).toEqual([
      { email: DEMO_USER.email, status: 'created' },
      {
        email: ADMIN_EMAIL,
        status: 'created',
        generatedPassword: expect.any(String),
      },
    ]);

    // both accounts can log in with the seeded passwords
    const http = request(app.getHttpServer());
    await http
      .post('/auth/login')
      .send({ email: DEMO_USER.email, password: DEMO_USER.password })
      .expect(201);
    await http
      .post('/auth/login')
      .send({ email: ADMIN_EMAIL, password: results[1].generatedPassword })
      .expect(201);
  });

  it('gives the admin the admin role and the demo user the user role', async () => {
    expect((await users.findByEmail(ADMIN_EMAIL))?.role).toBe(Role.ADMIN);
    expect((await users.findByEmail(DEMO_USER.email))?.role).toBe(Role.USER);
  });

  it('is idempotent and never reveals a password for existing accounts', async () => {
    const results = await seedUsers(users, 'Ignored-passw0rd');

    expect(results).toEqual([
      { email: DEMO_USER.email, status: 'exists' },
      { email: ADMIN_EMAIL, status: 'exists', generatedPassword: undefined },
    ]);
  });

  it('generates passwords that pass the sign-up password policy', () => {
    for (let i = 0; i < 20; i++) {
      const dto = plainToInstance(RegisterDto, {
        email: 'policy@example.com',
        password: generatePassword(),
      });
      expect(validateSync(dto)).toEqual([]);
    }
  });

  it('demo password passes the sign-up password policy', () => {
    const dto = plainToInstance(RegisterDto, DEMO_USER);
    expect(validateSync(dto)).toEqual([]);
  });
});
