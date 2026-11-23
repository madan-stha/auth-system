import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1795434357326 implements MigrationInterface {
  name = 'InitialSchema1795434357326';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE \`users\` (\`id\` int NOT NULL AUTO_INCREMENT, \`email\` varchar(254) NOT NULL, \`password\` varchar(255) NOT NULL, \`name\` varchar(100) NULL, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`updatedAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6), UNIQUE INDEX \`UQ_users_email\` (\`email\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `CREATE TABLE \`refresh_tokens\` (\`id\` int NOT NULL AUTO_INCREMENT, \`jti\` varchar(36) NOT NULL, \`expiresAt\` datetime NOT NULL, \`revoked\` tinyint NOT NULL DEFAULT 0, \`createdAt\` datetime(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6), \`userId\` int NOT NULL, UNIQUE INDEX \`UQ_refresh_tokens_jti\` (\`jti\`), INDEX \`IDX_refresh_tokens_user_id\` (\`userId\`), INDEX \`IDX_refresh_tokens_expires_at\` (\`expiresAt\`), PRIMARY KEY (\`id\`)) ENGINE=InnoDB`,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` ADD CONSTRAINT \`FK_refresh_tokens_user\` FOREIGN KEY (\`userId\`) REFERENCES \`users\`(\`id\`) ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` DROP FOREIGN KEY \`FK_refresh_tokens_user\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_refresh_tokens_expires_at\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_refresh_tokens_user_id\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_refresh_tokens_jti\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(`DROP TABLE \`refresh_tokens\``);
    await queryRunner.query(`DROP INDEX \`UQ_users_email\` ON \`users\``);
    await queryRunner.query(`DROP TABLE \`users\``);
  }
}
