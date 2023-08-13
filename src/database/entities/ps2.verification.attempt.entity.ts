import { BaseEntity } from './base.entity';
import { Entity, Index, Property, Unique } from '@mikro-orm/core';
import { GuildMember, Message } from 'discord.js';

@Entity()
export class PS2VerificationAttemptEntity extends BaseEntity {
  @Property()
  @Unique()
  @Index()
    characterId: string;

  @Property()
  @Unique()
    guildMember: string;

  @Property({
    type: String,
  })
    guildMessage: string;

  constructor(characterId: string, guildMember: GuildMember, guildMessage: Message) {
    super();
    this.characterId = characterId;
    this.guildMember = JSON.stringify(guildMember);
    this.guildMessage = JSON.stringify(guildMessage);
  }
}
