import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Channel, Client } from 'discord.js';

@Injectable()
export class DiscordService implements OnModuleInit {
  constructor(
    @InjectDiscordClient() private readonly discordClient: Client,
  ) {}

  async onModuleInit() {
    console.log('DiscordService initialized');
  }

  getUser() {

  }

  async getChannel(channelId: string): Promise<Channel> {
    return await this.discordClient.channels.fetch(channelId);
  }
}
