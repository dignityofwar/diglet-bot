import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from './base.entity';

export interface AlbionRegistrationsEntityInterface {
  discordId: string;
  characterId: string;
  characterName: string;
  guildId: string;
  manual: boolean;
  manualCreatedByDiscordId?: string;
  manualCreatedByDiscordName?: string;
  graduateSince?: Date | null;
  adeptSince?: Date | null;
  lastRankUpRequestAt?: Date | null;
  lastDenialNoticeAt?: Date | null;
}

@Entity()
@Unique({
  name: 'unique_guild_character',
  properties: ['guildId', 'characterId'], // Allows only one character per guild
})
@Unique({
  name: 'unique_guild_discord',
  properties: ['guildId', 'discordId'], // Allows only one character per guild
})
export class AlbionRegistrationsEntity extends BaseEntity {
  @Property({
    nullable: false,
  })
  @Index()
  discordId: string;

  @Property({
    nullable: false,
  })
  @Index()
  characterId: string;

  @Property({
    nullable: false,
  })
  characterName: string;

  @Property({
    nullable: false,
  })
  guildId: AlbionRegistrationsEntityInterface['guildId'];

  @Property({
    nullable: false,
    default: false,
  })
  manual = false;

  @Property({
    nullable: true,
    default: null,
  })
  manualCreatedByDiscordId: null | string = null;

  @Property({
    nullable: true,
    default: null,
  })
  manualCreatedByDiscordName: null | string = null;

  // Rank tenure. Stamped on role gain, or seeded at boot for members who already held the rank.
  @Property({
    nullable: true,
    default: null,
  })
  graduateSince: null | Date = null;

  @Property({
    nullable: true,
    default: null,
  })
  adeptSince: null | Date = null;

  // 7 day cooldown between rank up requests
  @Property({
    nullable: true,
    default: null,
  })
  lastRankUpRequestAt: null | Date = null;

  // 24 hour throttle on the public denial notice, kept separate so a denial never
  // triggers the request cooldown above
  @Property({
    nullable: true,
    default: null,
  })
  lastDenialNoticeAt: null | Date = null;

  constructor(options: AlbionRegistrationsEntityInterface) {
    super();
    Object.assign(this, options);
  }
}
