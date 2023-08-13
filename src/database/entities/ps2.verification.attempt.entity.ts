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
    guildMember: GuildMember;

  @Property()
    guildMessage: Message;

  constructor(characterId: string, guildMember: GuildMember, guildMessage: Message) {
    super();
    this.characterId = characterId;
    this.guildMember = guildMember;
    this.guildMessage = guildMessage;
  }
}
