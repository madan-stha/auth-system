import { INestApplication, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as cookieParser from 'cookie-parser';

/**
 * Global middleware and settings shared by main.ts and the e2e tests,
 * so tests exercise the app exactly as it runs in production.
 */
export function configureApp(app: INestApplication): void {
  const config = app.get(ConfigService);

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
}
