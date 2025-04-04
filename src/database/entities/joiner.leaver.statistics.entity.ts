import { BaseEntity } from './base.entity';
import { Entity, Property } from '@mikro-orm/core';

interface JoinerLeaverStatisticsEntityOptions {
  joiners: number;
  leavers: number;
  rejoiners: number;
  earlyLeavers: number;
  avgTimeToLeave: string;
}

@Entity()
export class JoinerLeaverStatisticsEntity extends BaseEntity {
  @Property()
    joiners: number = 0;

  @Property()
    leavers: number = 0;

  @Property()
    rejoiners: number = 0;

  @Property()
    earlyLeavers: number = 0;

  @Property()
    avgTimeToLeave: string = '0d 0h 0m';

  constructor(options: JoinerLeaverStatisticsEntityOptions) {
    super();
    Object.assign(this, options);
  }
}
