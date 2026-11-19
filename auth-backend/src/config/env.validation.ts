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

  DB_HOST: Joi.string().default('localhost'),
  DB_PORT: Joi.number().port().default(3306),
  DB_USERNAME: Joi.string().required(),
  DB_PASSWORD: Joi.string().allow('').required(),
  DB_NAME: Joi.string().required(),
  // Auto-sync entities to tables. Dev convenience only; replaced by migrations later.
  DB_SYNCHRONIZE: Joi.boolean().default(false),

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
});
