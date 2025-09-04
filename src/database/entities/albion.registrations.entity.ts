import { Entity, Index, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

export interface AlbionRegistrationsEntityInterface {
  discordId: string;
  characterId: string;
  characterName: string;
  guildId: string;
  manual: boolean;
  manualCreatedByDiscordId?: string;
  manualCreatedByDiscordName?: string;
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

  constructor(options: AlbionRegistrationsEntityInterface) {
    super();
    Object.assign(this, options);
  }
}
