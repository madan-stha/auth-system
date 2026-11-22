import { INestApplication, Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppController } from '../../src/app.controller';
import { AppService } from '../../src/app.service';
import { AuthModule } from '../../src/auth/auth.module';
import { UsersModule } from '../../src/users/users.module';
import { User } from '../../src/users/user.entity';
import { RefreshToken } from '../../src/auth/refresh-token.entity';
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
};

// ConfigModule.forRoot() validates process.env when this file is loaded,
// so the test environment must be in place before the module is declared.
Object.assign(process.env, TEST_ENV);

/**
 * Same feature modules and config validation as AppModule, but backed by an
 * in-memory SQL database (sql.js) so the e2e suite runs without MySQL.
 */
@Module({
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
    UsersModule,
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
class TestAppModule {}

export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  configureApp(app);
  await app.init();
  return app;
}
