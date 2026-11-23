import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { RefreshToken } from './refresh-token.entity';

/**
 * Removes refresh-token records that can no longer be used.
 *
 * Only *expired* tokens are deleted. Revoked tokens are kept until they
 * expire, so that replaying a revoked (possibly stolen) token is still
 * recognised as "revoked" rather than "unknown". Token reuse detection
 * depends on those records.
 */
@Injectable()
export class TokenCleanupService {
  private readonly logger = new Logger(TokenCleanupService.name);

  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>,
  ) {}

  @Cron(CronExpression.EVERY_HOUR, { name: 'refresh-token-cleanup' })
  async handleCron(): Promise<void> {
    try {
      const deleted = await this.deleteExpired();
      if (deleted > 0) {
        this.logger.log(`Deleted ${deleted} expired refresh token(s)`);
      }
    } catch (err) {
      this.logger.error(
        'Refresh token cleanup failed',
        err instanceof Error ? err.stack : String(err),
      );
    }
  }

  /** Deletes refresh tokens that expired before `now`. Returns how many. */
  async deleteExpired(now: Date = new Date()): Promise<number> {
    const result = await this.refreshRepo.delete({ expiresAt: LessThan(now) });
    return result.affected ?? 0;
  }
}
