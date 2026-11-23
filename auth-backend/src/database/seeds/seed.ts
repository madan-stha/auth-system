/**
 * Seeds development data:  npm run seed
 * Requires the database to be migrated first (npm run migration:run).
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../app.module';
import { UsersService } from '../../users/users.service';
import { DEMO_USER, seedUsers } from './seed-users';

async function main() {
  const logger = new Logger('Seed');

  if (process.env.NODE_ENV === 'production') {
    logger.error('Refusing to seed demo accounts with NODE_ENV=production.');
    process.exitCode = 1;
    return;
  }

  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });

  try {
    const results = await seedUsers(
      app.get(UsersService),
      process.env.SEED_ADMIN_PASSWORD,
    );

    for (const r of results) {
      console.log(`  ${r.email}: ${r.status}`);
    }
    console.log(`  Demo login: ${DEMO_USER.email} / ${DEMO_USER.password}`);

    const admin = results.find((r) => r.generatedPassword);
    if (admin) {
      console.log(
        `  Generated admin password (shown once, store it now): ${admin.generatedPassword}`,
      );
    }
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  new Logger('Seed').error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
});
