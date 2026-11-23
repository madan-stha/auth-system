import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Index('UQ_users_email', { unique: true })
  @Column({ length: 254 })
  email: string;

  // Never loaded unless a query asks for it explicitly (login), and never
  // serialized into a response even if it was loaded.
  @Exclude({ toPlainOnly: true })
  @Column({ select: false })
  password: string;

  @Column({ length: 100, nullable: true })
  name?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
