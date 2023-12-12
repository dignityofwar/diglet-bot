import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Channel, Client, GuildMember, Message } from 'discord.js';

@Injectable()
export class DiscordService implements OnModuleInit {
  private readonly logger = new Logger(DiscordService.name);

  constructor(
    @InjectDiscordClient() private readonly discordClient: Client,
  ) {}

  async onModuleInit() {
    console.log('DiscordService initialized');
  }

  async getGuild(guildId: string) {
    const guild = this.discordClient.guilds.cache.get(guildId);
    if (!guild) throw new Error(`Could not find guild with ID ${guildId}`);
    return guild;
  }

  async getChannel(channelId: string): Promise<Channel> {
    return await this.discordClient.channels.fetch(channelId);
  }

  async getGuildMemberFromId(guildId: string, memberId: string) {
    const server = await this.getGuild(guildId);

    if (!server) {
      throw new Error(`Could not find server with ID ${guildId}!`);
    }
    return await server.members.fetch(memberId);
  }

  async getOtherGuildMember(guildMember: GuildMember, memberId: string): Promise<GuildMember | null> {
    const serverId = guildMember.guild.id;
    const server = this.discordClient.guilds.cache.get(serverId);

    try {
      return await server.members.fetch(memberId);
    }
    catch (err) {
      console.log(err);
      return null;
    }
  }

  async getMemberRole(guildMember: GuildMember, roleId: string) {
    const serverId = guildMember.guild.id;
    return await this.discordClient.guilds.cache.get(serverId).roles.fetch(roleId);
  }

  async kickMember(guildMember: GuildMember, message: Message, reason?: string) {
    try {
      await guildMember.kick(reason);
    }
    catch (err) {
      await message.channel.send(`⚠️ Failed to kick member <@${guildMember.id}>! Err: ${err.message}`);
      this.logger.error('Failed to kick member', err);
    }
  }

  async deleteMessage(message: Message) {
    try {
      await message.delete();
    }
    catch (err) {
      this.logger.error('Failed to delete message', err);
    }
  }
}
