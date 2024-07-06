import { Injectable, Logger } from '@nestjs/common';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Channel, Client, Guild, GuildMember, Message, Role } from 'discord.js';

@Injectable()
export class DiscordService {
  private readonly logger = new Logger(DiscordService.name);

  constructor(
    @InjectDiscordClient() private readonly discordClient: Client,
  ) {}

  async getGuild(guildId: string): Promise<Guild> {
    let guild: Guild;

    try {
      // Get the guild from the GuildManager (client.guilds)
      guild = this.discordClient.guilds.cache.get(guildId);
    }
    catch (err) {
      this.logger.error(`Failed to fetch guild with ID ${guildId}`, err);
      throw new Error(`Failed to fetch guild with ID ${guildId}. Err: ${err.message}`);
    }

    if (!guild) {
      throw new Error(`Could not find guild with ID ${guildId}`);
    }
    return guild;
  }

  async getChannel(channelId: string): Promise<Channel> {
    try {
      return await this.discordClient.channels.fetch(channelId);
    }
    catch (err) {
      throw new Error(`Failed to fetch channel with ID ${channelId}`);
    }
  }

  async getGuildMember(guildId: string, memberId: string): Promise<GuildMember> {
    const server = await this.getGuild(guildId);

    let member: GuildMember;

    try {
      member = await server.members.fetch(memberId);
    }
    catch (err) {
      this.logger.error(`Failed to fetch member with ID ${memberId}`, err);
      throw new Error(`Failed to fetch member with ID ${memberId}. Err: ${err.message}`);
    }

    if (!member) {
      throw new Error(`Could not find member with ID ${memberId}`);
    }
    return member;
  }

  async getMemberRole(guildMember: GuildMember, roleId: string): Promise<Role> {
    const serverId = guildMember.guild.id;

    let role: Role;

    try {
      role = await this.discordClient.guilds.cache.get(serverId).roles.fetch(roleId);
    }
    catch (err) {
      throw new Error(`Failed to fetch role with ID ${roleId}. Err: ${err.message}`);
    }

    if (!role) {
      throw new Error(`Could not find role with ID ${roleId}`);
    }

    return role;
  }

  async kickMember(guildMember: GuildMember, message: Message, reason?: string): Promise<GuildMember> {
    try {
      return await guildMember.kick(reason);
    }
    catch (err) {
      await message.channel.send(`⚠️ Failed to kick member <@${guildMember.id}>! Err: ${err.message}`);
      this.logger.error('Failed to kick member', err);
    }
  }

  async deleteMessage(message: Message) : Promise<boolean> {
    try {
      await message.delete();
      return true;
    }
    catch (err) {
      this.logger.error('Failed to delete message', err);
    }
  }

  async batchSend(messages: string[], originMessage: Message): Promise<void> {
    let count = 0;

    // Loop each of the messages and carve them up into batches of 10
    const batchMessages = [];
    for (const message of messages) {
      count++;
      if (count % 10 === 0 || count === messages.length) {
        batchMessages.push(message);
      }
    }

    for (const batch of batchMessages) {
      await originMessage.channel.send(batch);
    }
  }
}
