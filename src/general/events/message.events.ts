import { Injectable, Logger } from '@nestjs/common';
import { Context, ContextOf, On } from 'necord';
import {
  Message,
  MessageReaction,
  PartialMessageReaction,
  PartialUser,
  User,
} from 'discord.js';
import { DatabaseService } from '../../database/services/database.service';
import { RecRolePingService } from '../services/rec.role.ping.service';

@Injectable()
export class MessageEvents {
  private readonly logger = new Logger(MessageEvents.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly recRolePingService: RecRolePingService,
  ) {}

  async handleMessageEvent(message: Message, type: string): Promise<void> {
    if (!message.member?.user) {
      throw new Error(`Message ${type} event could not be processed as the GuildMember was not found.`);
    }
    if (message.member.user.bot) {
      return;
    }

    const name = message.member.displayName || message.member.nickname || message.member.user.username || null;

    if (!name) {
      throw new Error(`Message ${type} event could not be processed as member ID "${message.member.id}" does not have a name!`);
    }

    this.logger.verbose(`Message ${type} event detected from: ${name}`);

    await this.databaseService.updateActivity(message.member);

    // Create only, otherwise edits and deletions re-send the reminder.
    if (type === 'create') {
      await this.recRolePingService.onMessage(message);
    }
  }

  async handleMessageReaction(
    message: MessageReaction,
    user: User,
    type: string,
  ): Promise<void> {
    if (user.bot) {
      return;
    }

    this.logger.debug(`Message Reaction ${type} event detected from "${user.displayName}"`);

    // Get the GuildMember from the guild as the client user isn't compatible with the GuildMember class
    const guildMember = message.message.guild.members.cache.get(user.id);

    if (!guildMember) {
      this.logger.error(`Unable to get GuildMember for "${user.displayName}", this could mean they have left the server.`);
      return;
    }
    await this.databaseService.updateActivity(guildMember);
  }

  async handlePartialReactions(
    reaction: MessageReaction | PartialMessageReaction,
    user: User | PartialUser,
  ): Promise<{ reaction: MessageReaction, user: User }> {
    let realReaction = reaction as MessageReaction;
    if (reaction.partial) {
      try {
        realReaction = await reaction.fetch();
      }
      catch (error) {
        this.logger.error(`Error fetching reaction: ${error.message}`);
        throw error;
      }
    }

    let realUser = user as User;

    if (user.partial) {
      try {
        realUser = await user.fetch();
      }
      catch (error) {
        this.logger.error(`Error fetching user "${user.displayName}": ${error.message}`);
        throw error;
      }
    }

    return {
      reaction: realReaction,
      user: realUser,
    };
  }

  // Annoyingly, these events are not additive and have to be defined every time.
  @On('messageCreate')
  async onMessageCreate(@Context() [message]: ContextOf<'messageCreate'>): Promise<void> {
    try {
      await this.handleMessageEvent(message, 'create');
      this.logger.verbose(`Message create event handled for ${message.member.displayName}`);
    }
    catch (error) {
      this.logger.error(`Error handling message create event: ${error.message}`);
    }
  }

  @On('messageUpdate')
  async onMessageUpdate(@Context() [message]: ContextOf<'messageUpdate'>): Promise<void> {
    try {
      await this.handleMessageEvent(message as Message, 'update');
      this.logger.verbose(`Message update event handled for ${message.member.displayName}`);
    }
    catch (error) {
      this.logger.error(`Error handling message update event: ${error.message}`);
    }
  }

  @On('messageDelete')
  async onMessageDelete(@Context() [message]: ContextOf<'messageDelete'>): Promise<void> {
    try {
      await this.handleMessageEvent(message as Message, 'delete');
      this.logger.verbose(`Message delete event handled for ${message.member.displayName}`);
    }
    catch (error) {
      this.logger.error(`Error handling message delete event: ${error.message}`);
    }
  }

  @On('messageReactionAdd')
  async onMessageReactionAdd(
    @Context() [reaction, user]: ContextOf<'messageReactionAdd'>,
  ): Promise<void> {
    try {
      const { reaction: fullReaction, user: fullUser } = await this.handlePartialReactions(reaction, user);
      await this.handleMessageReaction(fullReaction, fullUser, 'add');
    }
    catch (error) {
      this.logger.error(`Error handling message reaction add event. ${error.message}`);
    }
  }

  @On('messageReactionRemove')
  async onMessageReactionRemove(
    @Context() [reaction, user]: ContextOf<'messageReactionRemove'>,
  ): Promise<void> {
    try {
      const { reaction: fullReaction, user: fullUser } = await this.handlePartialReactions(reaction, user);
      await this.handleMessageReaction(fullReaction, fullUser, 'remove');
    }
    catch (error) {
      this.logger.error(`Error handling message reaction remove event. ${error.message}`);
    }
  }
}
