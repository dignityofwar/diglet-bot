import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';

@Entity()
export class Config {
  @PrimaryGeneratedColumn()
    id: number;

  @Column({
    unique: true,
  })
    key: string;

  @Column()
    value: string;

  @CreateDateColumn()
    createdAt: Date;

  @UpdateDateColumn()
    updatedDate: Date;
}
