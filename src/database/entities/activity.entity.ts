import { BaseEntity } from './base.entity';
import { Entity, Index, Property, Unique } from '@mikro-orm/core';

interface ActivityEntityOptions {
  discordId: string;
  discordNickname: string;
  lastActivity?: Date;
}

@Entity()
export class ActivityEntity extends BaseEntity {
  @Property()
  @Unique()
  @Index()
    discordId: string;

  @Property()
    discordNickname: string;

  @Property()
    lastActivity: Date = new Date();

  constructor(options: ActivityEntityOptions) {
    super();
    Object.assign(this, options);
  }
}
