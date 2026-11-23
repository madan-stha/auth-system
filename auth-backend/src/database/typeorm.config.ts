import { join } from 'path';
import { DataSourceOptions } from 'typeorm';

type EnvGetter = (key: string) => string | undefined;

/**
 * MySQL connection options shared by the Nest app (AppModule) and the
 * TypeORM CLI (data-source.ts), so both always use the same settings.
 *
 * The schema is managed only by migrations: `synchronize` is always off.
 */
export function buildDataSourceOptions(env: EnvGetter): DataSourceOptions {
  return {
    type: 'mysql',
    host: env('DB_HOST') ?? 'localhost',
    port: Number(env('DB_PORT') ?? 3306),
    username: env('DB_USERNAME'),
    password: env('DB_PASSWORD'),
    database: env('DB_NAME'),
    entities: [join(__dirname, '..', '**', '*.entity.{ts,js}')],
    migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
    migrationsTableName: 'migrations',
    synchronize: false,
  };
}
