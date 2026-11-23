import 'dotenv/config';
import { DataSource } from 'typeorm';
import { buildDataSourceOptions } from './typeorm.config';

/**
 * Data source for the TypeORM CLI (migration:generate / run / revert).
 * Reads the same .env file as the app.
 */
export default new DataSource(
  buildDataSourceOptions((key) => process.env[key]),
);
