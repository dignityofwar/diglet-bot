import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from './base.entity';

export interface MemberDailyActivityEntityInterface {
  discordId: string;
  date: Date;
  messagesSent?: number;
  reactionsAdded?: number;
  voiceMinutes?: number;
}

@Entity()
@Unique({
  name: 'unique_member_day',
  properties: ['discordId', 'date'], // The upsert in MemberActivityRollupService depends on this
})
export class MemberDailyActivityEntity extends BaseEntity {
  @Property({ nullable: false })
  @Index()
  discordId: string;

  // Always UTC midnight - see utcMidnight() in helpers.ts
  @Property({ nullable: false })
  @Index()
  date: Date;

  @Property({ nullable: false, default: 0 })
  messagesSent = 0;

  @Property({ nullable: false, default: 0 })
  reactionsAdded = 0;

  @Property({ nullable: false, default: 0 })
  voiceMinutes = 0;

  constructor(options: MemberDailyActivityEntityInterface) {
    super();
    Object.assign(this, options);
  }
}
