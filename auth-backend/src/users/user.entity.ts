import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  email: string;

  // Never loaded unless a query asks for it explicitly (login), and never
  // serialized into a response even if it was loaded.
  @Exclude({ toPlainOnly: true })
  @Column({ select: false })
  password: string;

  @Column({ nullable: true })
  name?: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
