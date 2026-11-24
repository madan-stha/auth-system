import * as Joi from 'joi';

/**
 * Every environment variable the API reads, validated at startup.
 * The app refuses to boot if a required value is missing or invalid,
 * so misconfiguration fails fast instead of at the first request.
 */
export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'production', 'test')
    .default('development'),
  PORT: Joi.number().port().default(3000),

  // Comma-separated list of allowed browser origins, e.g. "http://localhost:5173"
  CORS_ORIGIN: Joi.string().required(),

  DB_HOST: Joi.string().default('127.0.0.1'),
  DB_PORT: Joi.number().port().default(3306),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),

  // Access and refresh tokens are signed with different secrets so that a
  // leaked access-token secret cannot be used to mint refresh tokens.
  JWT_ACCESS_SECRET: Joi.string().min(32).required(),
  JWT_REFRESH_SECRET: Joi.string()
    .min(32)
    .required()
    .invalid(Joi.ref('JWT_ACCESS_SECRET'))
    .messages({
      'any.invalid': 'JWT_REFRESH_SECRET must differ from JWT_ACCESS_SECRET',
    }),
  JWT_ACCESS_TTL: Joi.string().default('15m'),
  JWT_REFRESH_TTL_DAYS: Joi.number().integer().min(1).default(7),

  // Per-IP rate limits, counted over a window of RATE_LIMIT_TTL_SECONDS.
  RATE_LIMIT_TTL_SECONDS: Joi.number().integer().min(1).default(60),
  RATE_LIMIT_MAX: Joi.number().integer().min(1).default(100),
  // Stricter limit for login and sign-up (brute-force protection).
  AUTH_RATE_LIMIT_MAX: Joi.number().integer().min(1).default(5),
});
