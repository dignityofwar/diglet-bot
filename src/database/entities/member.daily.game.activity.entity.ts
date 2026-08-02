import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from './base.entity';

// Discord caps activity names at 128 characters
export const GAME_NAME_MAX_LENGTH = 128;

export interface MemberDailyGameActivityEntityInterface {
  discordId: string;
  date: Date;
  gameName: string;
  minutes?: number;
}

@Entity()
@Unique({
  name: 'unique_member_day_game',
  properties: ['discordId', 'date', 'gameName'],
})
export class MemberDailyGameActivityEntity extends BaseEntity {
  @Property({ nullable: false })
  @Index()
  discordId: string;

  // Always UTC midnight - see utcMidnight() in helpers.ts
  @Property({ nullable: false })
  @Index()
  date: Date;

  @Property({ nullable: false, length: GAME_NAME_MAX_LENGTH })
  @Index()
  gameName: string;

  @Property({ nullable: false, default: 0 })
  minutes = 0;

  constructor(options: MemberDailyGameActivityEntityInterface) {
    super();
    Object.assign(this, options);
  }
}
