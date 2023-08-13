import { Entity, Index, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

@Entity()
export class PS2MembersEntity extends BaseEntity {
  @Property()
  @Unique()
  @Index()
    discordId: string;

  @Property()
  @Unique()
  @Index()
    characterId: string;

  constructor(discordId: string, characterId: string) {
    super();
    this.discordId = discordId;
    this.characterId = characterId;
  }
}
