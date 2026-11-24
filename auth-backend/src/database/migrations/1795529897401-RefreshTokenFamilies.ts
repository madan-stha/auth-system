import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Token families, hashed token ids and session metadata.
 *
 * Existing refresh tokens are converted, not deleted, so nobody is logged
 * out: each existing token becomes its own session, and its jti is replaced
 * by SHA2(jti, 256), the same lowercase hex SHA-256 the app computes.
 */
export class RefreshTokenFamilies1795529897401 implements MigrationInterface {
  name = 'RefreshTokenFamilies1795529897401';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add the new columns as nullable so existing rows are valid
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\`
         ADD \`jtiHash\` varchar(64) NULL,
         ADD \`familyId\` varchar(36) NULL,
         ADD \`revokedAt\` datetime NULL,
         ADD \`sessionStartedAt\` datetime NULL,
         ADD \`userAgent\` varchar(255) NULL,
         ADD \`ip\` varchar(45) NULL`,
    );

    // 2. Convert existing tokens
    await queryRunner.query(
      `UPDATE \`refresh_tokens\`
          SET \`jtiHash\` = SHA2(\`jti\`, 256),
              \`familyId\` = UUID(),
              \`sessionStartedAt\` = \`createdAt\``,
    );

    // 3. Make the required columns NOT NULL and index them
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\`
         MODIFY \`jtiHash\` varchar(64) NOT NULL,
         MODIFY \`familyId\` varchar(36) NOT NULL,
         MODIFY \`sessionStartedAt\` datetime NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_refresh_tokens_jti_hash\` ON \`refresh_tokens\` (\`jtiHash\`)`,
    );
    await queryRunner.query(
      `CREATE INDEX \`IDX_refresh_tokens_family_id\` ON \`refresh_tokens\` (\`familyId\`)`,
    );

    // 4. Drop the raw jti
    await queryRunner.query(
      `DROP INDEX \`UQ_refresh_tokens_jti\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` DROP COLUMN \`jti\``,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // A hash can't be turned back into a jti, so existing refresh tokens
    // are deleted: everyone has to log in again after a revert.
    await queryRunner.query(`DELETE FROM \`refresh_tokens\``);

    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\` ADD \`jti\` varchar(36) NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX \`UQ_refresh_tokens_jti\` ON \`refresh_tokens\` (\`jti\`)`,
    );
    await queryRunner.query(
      `DROP INDEX \`IDX_refresh_tokens_family_id\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `DROP INDEX \`UQ_refresh_tokens_jti_hash\` ON \`refresh_tokens\``,
    );
    await queryRunner.query(
      `ALTER TABLE \`refresh_tokens\`
         DROP COLUMN \`ip\`,
         DROP COLUMN \`userAgent\`,
         DROP COLUMN \`sessionStartedAt\`,
         DROP COLUMN \`revokedAt\`,
         DROP COLUMN \`familyId\`,
         DROP COLUMN \`jtiHash\``,
    );
  }
}
