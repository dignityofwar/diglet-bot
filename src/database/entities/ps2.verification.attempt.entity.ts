import { BaseEntity } from './base.entity';
import { Entity, Index, Property, Unique } from '@mikro-orm/core';
import { GuildMember, Message } from 'discord.js';

interface PS2VerificationAttemptEntityOptions {
  characterId: string;
  characterName: string;
  guildMember: GuildMember;
  guildMessage: Message;
}

@Entity()
export class PS2VerificationAttemptEntity extends BaseEntity {
  @Property()
  @Unique()
  @Index()
    characterId: string;

  @Property()
    characterName: string;

  @Property()
    guildMember: GuildMember;

  @Property()
    guildMessage: Message;

  constructor(options: PS2VerificationAttemptEntityOptions) {
    super();
    Object.assign(this, options);
  }
}
