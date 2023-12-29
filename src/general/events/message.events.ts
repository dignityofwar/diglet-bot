import { Injectable, Logger } from '@nestjs/common';
import { On } from '@discord-nestjs/core';
import {
  Events,
  GuildMember,
  Message,
  MessageReaction,
  User,
} from 'discord.js';
import { DatabaseService } from '../../database/services/database.service';

@Injectable()
export class MessageEvents {
  private readonly logger = new Logger(MessageEvents.name);

  constructor(
    private readonly databaseService: DatabaseService,
  ) {}

  async handleMessageEvent(member: GuildMember, type: string): Promise<void> {
    if (member.user.bot) return;

    console.log(`Message ${type} event detected from: ${member.nickname || member.user.username}`);

    await this.databaseService.updateActivity(member);
  }

  async handleMessageReaction(
    message: MessageReaction,
    user: User,
    type: string
  ): Promise<void> {
    if (user.bot) return;

    console.log(`Message Reaction ${type} event detected from: ${user.username}`);

    // Get the GuildMember from the guild as the client user isn't compatible with the GuildMember class
    const guildMember = message.message.guild.members.cache.get(user.id);

    if (!guildMember) {
      this.logger.error(`Unable to get GuildMember for ${user.username}`);
      return;
    }
    await this.databaseService.updateActivity(guildMember);
  }

  async handlePartialReactions(reaction: MessageReaction, user: User): Promise<{ reaction: MessageReaction, user: User }> {
    if (reaction.partial) {
      try {
        reaction = await reaction.fetch();
      }
      catch (error) {
        this.logger.error(`Error fetching reaction: ${error.message}`);
        throw error;
      }
    }

    if (user.partial) {
      try {
        user = await user.fetch();
      }
      catch (error) {
        this.logger.error(`Error fetching user: ${error.message}`);
        throw error;
      }
    }

    return { reaction, user };
  }

  // Annoyingly, these events are not additive and have to be defined every time.
  @On(Events.MessageCreate)
  async onMessageCreate(message: Message): Promise<void> {
    await this.handleMessageEvent(message.member, 'create');
  }

  @On(Events.MessageUpdate)
  async onMessageUpdate(message: Message): Promise<void> {
    await this.handleMessageEvent(message.member, 'update');
  }

  @On(Events.MessageDelete)
  async onMessageDelete(message: Message): Promise<void> {
    await this.handleMessageEvent(message.member, 'delete');
  }

  @On(Events.MessageReactionAdd)
  async onMessageReactionAdd(reaction: MessageReaction, user: User): Promise<void> {
    const { reaction: fullReaction, user: fullUser } = await this.handlePartialReactions(reaction, user);
    await this.handleMessageReaction(fullReaction, fullUser, 'add');
  }

  @On(Events.MessageReactionRemove)
  async onMessageReactionRemove(reaction: MessageReaction, user: User): Promise<void> {
    const { reaction: fullReaction, user: fullUser } = await this.handlePartialReactions(reaction, user);
    await this.handleMessageReaction(fullReaction, fullUser, 'remove');
  }
}
