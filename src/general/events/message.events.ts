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
    if (!member || !member.user) {
      throw new Error(`Message ${type} event could not be processed as the GuildMember was not found.`);
    }
    if (member.user.bot) return;

    const name = member.displayName || member.nickname || member.user.username || null;

    if (!name) {
      throw new Error(`Message ${type} event could not be processed as member ID "${member.id}" does not have a name!`);
    }

    this.logger.debug(`Message ${type} event detected from: ${name}`);

    await this.databaseService.updateActivity(member);
  }

  async handleMessageReaction(
    message: MessageReaction,
    user: User,
    type: string
  ): Promise<void> {
    if (user.bot) return;

    this.logger.debug(`Message Reaction ${type} event detected from "${user.displayName}"`);

    // Get the GuildMember from the guild as the client user isn't compatible with the GuildMember class
    const guildMember = message.message.guild.members.cache.get(user.id);

    if (!guildMember) {
      this.logger.error(`Unable to get GuildMember for "${user.displayName}", this could mean they have left the server.`);
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
        this.logger.error(`Error fetching user "${user.displayName}": ${error.message}`);
        throw error;
      }
    }

    return { reaction, user };
  }

  // Annoyingly, these events are not additive and have to be defined every time.
  @On(Events.MessageCreate)
  async onMessageCreate(message: Message): Promise<void> {
    try {
      await this.handleMessageEvent(message.member, 'create');
      this.logger.debug(`Message create event handled for ${message.member.displayName}`);
    }
    catch (error) {
      this.logger.error(`Error handling message create event: ${error.message}`);
    }
  }

  @On(Events.MessageUpdate)
  async onMessageUpdate(message: Message): Promise<void> {
    try {
      await this.handleMessageEvent(message.member, 'update');
      this.logger.debug(`Message update event handled for ${message.member.displayName}`);
    }
    catch (error) {
      this.logger.error(`Error handling message update event: ${error.message}`);
    }
  }

  @On(Events.MessageDelete)
  async onMessageDelete(message: Message): Promise<void> {
    try {
      await this.handleMessageEvent(message.member, 'delete');
      this.logger.debug(`Message delete event handled for ${message.member.displayName}`);
    }
    catch (error) {
      this.logger.error(`Error handling message delete event: ${error.message}`);
    }
  }

  @On(Events.MessageReactionAdd)
  async onMessageReactionAdd(reaction: MessageReaction, user: User): Promise<void> {
    try {
      const { reaction: fullReaction, user: fullUser } = await this.handlePartialReactions(reaction, user);
      await this.handleMessageReaction(fullReaction, fullUser, 'add');
    }
    catch (error) {
      this.logger.error(`Error handling message reaction add event. ${error.message}`);
    }
  }

  @On(Events.MessageReactionRemove)
  async onMessageReactionRemove(reaction: MessageReaction, user: User): Promise<void> {
    try {
      const { reaction: fullReaction, user: fullUser } = await this.handlePartialReactions(reaction, user);
      await this.handleMessageReaction(fullReaction, fullUser, 'remove');
    }
    catch (error) {
      this.logger.error(`Error handling message reaction remove event. ${error.message}`);
    }
  }
}
