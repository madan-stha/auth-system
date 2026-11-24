import { ExecutionContext, Module, SetMetadata } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { seconds, ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';

const AUTH_RATE_LIMITED = 'authRateLimited';

/**
 * Applies the stricter "auth" rate limit (AUTH_RATE_LIMIT_MAX per window)
 * to a route, on top of the general limit. Use on credential endpoints
 * such as login and sign-up to slow down brute-force attempts.
 */
export const AuthRateLimit = () => SetMetadata(AUTH_RATE_LIMITED, true);

function isAuthRateLimited(context: ExecutionContext): boolean {
  return (
    Reflect.getMetadata(AUTH_RATE_LIMITED, context.getHandler()) === true ||
    Reflect.getMetadata(AUTH_RATE_LIMITED, context.getClass()) === true
  );
}

/**
 * Per-IP rate limiting for every route:
 * - "default": RATE_LIMIT_MAX requests per RATE_LIMIT_TTL_SECONDS
 * - "auth":    AUTH_RATE_LIMIT_MAX requests per window, only on routes
 *              marked with @AuthRateLimit()
 * Exceeding a limit returns 429 Too Many Requests with a Retry-After header
 * (Retry-After-auth for the auth limit).
 */
@Module({
  imports: [
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const ttl = seconds(
          config.getOrThrow<number>('RATE_LIMIT_TTL_SECONDS'),
        );
        return {
          errorMessage: 'Too many requests, please try again later.',
          throttlers: [
            {
              name: 'default',
              ttl,
              limit: config.getOrThrow<number>('RATE_LIMIT_MAX'),
            },
            {
              name: 'auth',
              ttl,
              limit: config.getOrThrow<number>('AUTH_RATE_LIMIT_MAX'),
              skipIf: (context) => !isAuthRateLimited(context),
            },
          ],
        };
      },
    }),
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class RateLimitModule {}
