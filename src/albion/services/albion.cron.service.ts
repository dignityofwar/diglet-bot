import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '../../discord/discord.service';
import { AlbionScanningService } from './albion.scanning.service';
import { AlbionServer } from '../interfaces/albion.api.interfaces';

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
    this.channel = await this.discordService.getTextChannel(channelId);

    if (!this.channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }
    if (!this.channel.isTextBased()) {
      throw new Error(`Channel with ID ${channelId} is not a text channel`);
    }
  }

  @Cron('0 19 * * *')
  async runAlbionScansEU(): Promise<void> {
    this.logger.log('Running Albion Scans EU Cron');

    const message = await this.channel.send('Starting EU Scans');

    await this.albionScanningService.startScan(message, false, AlbionServer.EUROPE);
  }
}
