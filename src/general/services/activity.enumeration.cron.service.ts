import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '../../discord/discord.service';
import { Cron } from '@nestjs/schedule';
import { ActivityService } from './activity.service';

@Injectable()
export class ActivityEnumerationCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ActivityEnumerationCronService.name);
  private channel: TextChannel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    private readonly activityService: ActivityService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Initializing Activity Enumeration Service');

    const channelId = this.config.get('discord.channels.activityReports');

    // Check if the channel exists
    this.channel = await this.discordService.getChannel(channelId) as TextChannel;

    if (!this.channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }
    if (!this.channel.isTextBased()) {
      throw new Error(`Channel with ID ${channelId} is not a text channel`);
    }
  }

  @Cron('1 0 * * *')
  async runJob(): Promise<void> {
    this.logger.log('Running Activity Enumeration Job');
    const message = await this.channel.send('Starting daily activity enumeration...');
    await this.activityService.startEnumeration(message);
  }
}
