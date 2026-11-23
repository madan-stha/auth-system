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

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn()
  id: number;

  // JWT ID (jti) embedded in the refresh token; unique index for lookups
  @Index('UQ_refresh_tokens_jti', { unique: true })
  @Column({ length: 36 })
  jti: string;

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

  @CreateDateColumn()
  createdAt: Date;
}
