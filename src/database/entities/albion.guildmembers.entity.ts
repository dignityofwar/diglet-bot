import { Entity, Index, Property, Unique } from '@mikro-orm/core';
import { BaseEntity } from './base.entity';

export interface AlbionGuildMembersEntityInterface {
  characterId: string;
  characterName: string;
  registered: boolean
  warned: boolean
}

@Entity()
export class AlbionGuildMembersEntity extends BaseEntity {
  @Property({
    nullable: false,
  })

  @Property()
  @Unique()
  @Index()
    characterId: string;

  @Property()
    characterName: string;

  @Property()
    registered = false;

  @Property()
    warned = false;

  constructor(options: AlbionGuildMembersEntityInterface) {
    super();
    Object.assign(this, options);
  }
}
