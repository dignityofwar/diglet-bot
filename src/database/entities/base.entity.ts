import { Entity, PrimaryKey, Property } from "@mikro-orm/core";

export interface BaseEntityOptions {
  id?: number;
  createdAt?: Date;
  updatedAt?: Date;
}

@Entity({ abstract: true })
export abstract class BaseEntity {
  @PrimaryKey()
  id!: number;

  @Property()
  createdAt: Date = new Date();

  @Property({ onUpdate: () => new Date() })
  updatedAt: Date = new Date();

  protected constructor(options?: BaseEntityOptions) {
    Object.assign(this, options);
  }
}
