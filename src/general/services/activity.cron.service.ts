import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '../../discord/discord.service';
import { ActivityService } from './activity.service';

@Injectable()
export class ActivityCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ActivityCronService.name);
  private channel: TextChannel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    private readonly activityService: ActivityService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Initializing Albion Cron Service');

    const channelId = this.config.get('discord.channels.botJobs');

    // Check if the channel exists
    this.channel = await this.discordService.getChannel(channelId) as TextChannel;

    if (!this.channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }
    if (!this.channel.isTextBased()) {
      throw new Error(`Channel with ID ${channelId} is not a text channel`);
    }
  }

  // Run activity data scans every day at midnight
  @Cron('0 0 * * *')
  async runActivityDataScans(): Promise<void> {
    this.logger.log('Running Activity Data scans Cron');

    await this.channel.send('Starting activity scan cron');

    await this.activityService.scanAndRemoveLeavers(this.channel);
  }
}