import { BaseEntity } from './base.entity';
import { Entity, Property } from '@mikro-orm/core';

interface ActivityStatisticsEntityOptions {
  totalUsers: number;
  inactiveUsers: number;
  activeUsers90d: number;
  activeUsers60d: number;
  activeUsers30d: number;
  activeUsers14d: number;
  activeUsers7d: number;
  activeUsers3d: number;
  activeUsers2d: number;
  activeUsers1d: number;
}

@Entity()
export class ActivityStatisticsEntity extends BaseEntity {
  @Property()
    totalUsers: number = 0;

  @Property()
    inactiveUsers: number = 0;

  @Property()
    activeUsers90d: number = 0;

  @Property()
    activeUsers60d: number = 0;

  @Property()
    activeUsers30d: number = 0;

  @Property()
    activeUsers14d: number = 0;

  @Property()
    activeUsers7d: number = 0;

  @Property()
    activeUsers3d: number = 0;

  @Property()
    activeUsers2d: number = 0;

  @Property()
    activeUsers1d: number = 0;

  constructor(options: ActivityStatisticsEntityOptions) {
    super();
    Object.assign(this, options);
  }
}
