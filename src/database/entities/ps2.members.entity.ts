import { Entity, Index, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

export interface PS2MembersEntityInterface {
  discordId: string;
  characterId: string;
  characterName: string;
  manual: boolean;
  manualCreatedByDiscordId?: string;
  manualCreatedByDiscordName?: string;
}

@Entity()
export class PS2MembersEntity extends BaseEntity {
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

  @Property()
    manualCreatedByDiscordId: null | string;

  @Property()
    manualCreatedByDiscordName: null | string;

  constructor(options: PS2MembersEntityInterface) {
    super();
    Object.assign(this, options);
  }
}
