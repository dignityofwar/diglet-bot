import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '../../discord/discord.service';
import { AlbionScanningService } from './albion.scanning.service';

@Injectable()
export class AlbionCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionCronService.name);
  private channel: TextChannel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    private readonly albionScanningService: AlbionScanningService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Initializing Albion Cron Service');

    const channelId = this.config.get('discord.channels.albionScans');

    // Check if the channel exists
    this.channel = await this.discordService.getChannel(channelId) as TextChannel;

    if (!this.channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }
    if (!this.channel.isTextBased()) {
      throw new Error(`Channel with ID ${channelId} is not a text channel`);
    }
  }

  // TODO: Re-enable when ready to test.
  // @Cron('0 0 6,18 * * *')
  async runAlbionScans(): Promise<void> {
    this.logger.log('Running Albion Scans Cron');

    await this.channel.send('Starting daily scan...');

    const message = await this.channel.send('Running daily Albion Scans');

    await this.albionScanningService.startScan(message);
  }
}
