import { Entity, Index, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

export interface AlbionRegistrationsEntityInterface {
  discordId: string;
  characterId: string;
  characterName: string;
  manual: boolean;
  manualCreatedByDiscordId?: string;
  manualCreatedByDiscordName?: string;
}

@Entity()
export class AlbionRegistrationsEntity extends BaseEntity {
  @Property({
    nullable: false,
  })
  @Unique()
  @Index()
    discordId: string;

  @Property()
  @Unique()
  @Index()
    characterId: string;

  @Property()
    characterName: string;

  @Property()
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
