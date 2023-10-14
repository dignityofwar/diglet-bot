import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Channel, Client, Collection, GuildMember } from 'discord.js';

@Injectable()
export class DiscordService implements OnModuleInit {
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

  async getAllWithRole(discordGuildId: string, roleId: string): Promise<Collection<string, GuildMember>> {
    const guild = await this.getGuild(discordGuildId);
    const role = await guild.roles.fetch(roleId);
    return role.members;
  }
}
