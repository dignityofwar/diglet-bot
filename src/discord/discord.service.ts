import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Channel, Client, GuildMember } from 'discord.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class DiscordService implements OnModuleInit {
  constructor(
    @InjectDiscordClient() private readonly discordClient: Client,
  ) {}

  async onModuleInit() {
    console.log('DiscordService initialized');
  }

  // getUser() {
  //
  // }

  async getChannel(channelId: string): Promise<Channel> {
    return await this.discordClient.channels.fetch(channelId);
  }
  async getRole(guildMember: GuildMember, roleId: string) {
    const serverId = guildMember.guild.id;
    return await this.discordClient.guilds.cache.get(serverId).roles.fetch(roleId);
  }
}
