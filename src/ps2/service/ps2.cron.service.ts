import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PS2GameScanningService } from './ps2.game.scanning.service';
import { TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '../../discord/discord.service';

@Injectable()
export class PS2CronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PS2CronService.name);
  private channel: TextChannel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    private readonly ps2GameScanningService: PS2GameScanningService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Initializing PS2 Cron Service');

    const channelId = this.config.get('discord.channels.ps2Scans');

    // Check if the channel exists
    this.channel = await this.discordService.getChannel(channelId) as TextChannel;

    if (!this.channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }
    if (!this.channel.isTextBased()) {
      throw new Error(`Channel with ID ${channelId} is not a text channel`);
    }
  }

  @Cron(CronExpression.EVERY_DAY_AT_6PM)
  async runPS2Scans(): Promise<void> {
    this.logger.log('Running PS2 Scans Cron');

    await this.channel.send('Starting daily scan...');

    const message = await this.channel.send('Running daily PS2 Scans');

    await this.ps2GameScanningService.startScan(message);
  }
}
