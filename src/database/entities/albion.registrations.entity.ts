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
  name: 'unique_discordId_characterId_characterName_guildId',
  properties: ['discordId', 'characterId', 'characterName', 'guildId'], // Allows multiple characters, one per guild
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
