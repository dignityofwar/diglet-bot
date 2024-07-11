import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '../../discord/discord.service';
import { ActivityService } from './activity.service';
import * as Sentry from '@sentry/node';

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

  // Run activity data scans to keep activity data refreshed
  @Cron('0 */3 * * *')
  async runActivityLeaverScans(): Promise<void> {
    this.logger.log('Running Activity Leaver scans Cron');

    await this.channel.send('Starting activity leaver scan cron...');

    const checkInId = Sentry.captureCheckIn({
      monitorSlug: 'digletbot-scans',
      status: 'in_progress',
    });

    await this.activityService.startScan(this.channel, false);

    Sentry.captureCheckIn({
      checkInId,
      monitorSlug: 'digletbot-scans',
      status: 'ok',
    });
  }
}
