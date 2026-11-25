import {
  ClassSerializerInterceptor,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

/**
 * Global middleware and settings shared by main.ts and the e2e tests,
 * so tests exercise the app exactly as it runs in production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

  // Security headers (nosniff, frame protection, HSTS, no X-Powered-By, ...)
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({
    origin: config
      .getOrThrow<string>('CORS_ORIGIN')
      .split(',')
      .map((origin) => origin.trim()),
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true, // strip properties that have no validation decorator
      forbidNonWhitelisted: true, // ...and reject the request if any were sent
      transform: true, // run @Transform (trim/lowercase) and build DTO instances
    }),
  );

  // Applies @Exclude() on entities (e.g. User.password) to every response.
  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // One consistent JSON shape for every error response.
  app.useGlobalFilters(new AllExceptionsFilter());
}
