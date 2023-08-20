import { Injectable, Logger, OnApplicationBootstrap, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PS2GameScanningService } from './ps2.game.scanning.service';
import { InjectDiscordClient } from '@discord-nestjs/core';
import { Client, TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PS2CronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PS2CronService.name);
  private channel: TextChannel;

  constructor(
    @InjectDiscordClient() private readonly discordClient: Client,
    private readonly config: ConfigService,
    private readonly ps2GameScanningService: PS2GameScanningService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Initializing PS2 Cron Service');

    const channelId = this.config.get('discord.channels.ps2Scans');

    // Check if the channel exists
    this.channel = await this.discordClient.channels.fetch(channelId) as TextChannel;

    if (!this.channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }
    if (!this.channel.isTextBased()) {
      throw new Error(`Channel with ID ${channelId} is not a text channel`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_8PM)
  async runPS2Scans(): Promise<void> {
    this.logger.log('Running PS2 Scans Cron');

    await this.channel.send('Starting daily scan...');

    const message = await this.channel.send('Running daily PS2 Scans');

    await this.ps2GameScanningService.startScan(message);
  }
}
