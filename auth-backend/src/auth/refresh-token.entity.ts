import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { User } from '../users/user.entity';

/**
 * One refresh token. Every login starts a new token *family* (a session);
 * each refresh rotates to a new token in the same family. Only one token
 * per family is active at a time.
 */
@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  // SHA-256 of the token's jti. The raw jti is never stored.
  @Index('UQ_refresh_tokens_jti_hash', { unique: true })
  @Column({ length: 64 })
  jtiHash: string;

  // Session id: shared by every token issued from one login
  @Index('IDX_refresh_tokens_family_id')
  @Column({ length: 36 })
  familyId: string;

  // Deleting a user deletes their refresh tokens
  @Index('IDX_refresh_tokens_user_id')
  @ManyToOne(() => User, { eager: true, onDelete: 'CASCADE', nullable: false })
  @JoinColumn({
    name: 'userId',
    foreignKeyConstraintName: 'FK_refresh_tokens_user',
  })
  user: User;

  // Used by the cleanup job to find expired tokens
  @Index('IDX_refresh_tokens_expires_at')
  @Column()
  expiresAt: Date;

  @Column({ default: false })
  revoked: boolean;

  // When the token was rotated or revoked; used for the reuse grace window
  @Column({ type: 'datetime', nullable: true })
  revokedAt: Date | null;

  // When the session (family) started, copied to every token in the family
  @Column()
  sessionStartedAt: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
