import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';
import { AuthModule } from '../../src/auth/auth.module';
import { UsersModule } from '../../src/users/users.module';
import { User } from '../../src/users/user.entity';
import { RefreshToken } from '../../src/auth/refresh-token.entity';
import { RateLimitModule } from '../../src/common/rate-limit/rate-limit.module';
import { envValidationSchema } from '../../src/config/env.validation';
import { configureApp } from '../../src/app.setup';

export const TEST_ENV = {
  NODE_ENV: 'test',
  CORS_ORIGIN: 'http://localhost:5173',
  DB_USERNAME: 'unused',
  DB_PASSWORD: 'unused',
  DB_NAME: 'unused',
  JWT_ACCESS_SECRET: 'test-access-secret-0123456789abcdefghijkl',
  JWT_REFRESH_SECRET: 'test-refresh-secret-0123456789abcdefghijk',
  JWT_ACCESS_TTL: '15m',
  JWT_REFRESH_TTL_DAYS: '7',
  // High limits so suites that log in many times aren't throttled;
  // rate-limit tests pass lower values to createTestApp().
  RATE_LIMIT_TTL_SECONDS: '60',
  RATE_LIMIT_MAX: '10000',
  AUTH_RATE_LIMIT_MAX: '10000',
};

export type TestEnv = Partial<Record<keyof typeof TEST_ENV, string>>;

/**
 * Builds the app with the same feature modules, rate limiting and config
 * validation as AppModule, but backed by an in-memory SQL database (sql.js)
 * so the e2e suite runs without MySQL. `env` overrides TEST_ENV values.
 */
export async function createTestApp(
  env: TestEnv = {},
): Promise<INestApplication> {
  // ConfigModule.forRoot() validates process.env when it is called,
  // so the environment must be in place before the module is built.
  Object.assign(process.env, TEST_ENV, env);

  const moduleRef = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({
        isGlobal: true,
        ignoreEnvFile: true,
        validationSchema: envValidationSchema,
      }),
      TypeOrmModule.forRoot({
        type: 'sqljs',
        entities: [User, RefreshToken],
        synchronize: true,
        dropSchema: true,
      }),
      RateLimitModule,
      UsersModule,
      AuthModule,
    ],
    controllers: [AppController],
    providers: [AppService],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
