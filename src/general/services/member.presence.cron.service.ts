import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ActivityType } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '../../discord/discord.service';
import { GameActivitySample, MemberActivityRollupService } from './member.activity.rollup.service';

@Injectable()
export class MemberPresenceCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(MemberPresenceCronService.name);
  private guildId: string;

  // @nestjs/schedule doesn't prevent a slow tick overlapping the next, and an overlap
  // double counts the minute for everyone in voice and everyone playing a game.
  private isRunning = false;

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    private readonly rollupService: MemberActivityRollupService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.guildId = this.config.get('discord.guildId');

    if (!this.guildId) {
      throw new Error('Could not determine the Discord guild ID for presence tracking');
    }
  }

  @Cron('* * * * *')
  async recordPresenceMinutes(): Promise<void> {
    if (this.isRunning) {
      this.logger.warn('Previous presence tick still running, skipping this minute');
      return;
    }

    this.isRunning = true;

    try {
      // Each half gets its own guard so one failing doesn't cost the other its minute
      await this.recordVoiceMinutes();
      await this.recordGameMinutes();
    }
    finally {
      this.isRunning = false;
    }
  }

  async recordVoiceMinutes(): Promise<void> {
    try {
      const members = await this.discordService.getVoiceChannelMembers(this.guildId);

      if (members.length === 0) {
        return;
      }

      await this.rollupService.increment(members.map((member) => member.id), 'voiceMinutes');
    }
    catch (err) {
      // A skipped tick is a minute that can never be reconstructed, so warn rather than debug
      this.logger.warn(`Failed to record voice minutes: ${err.message}`);
    }
  }

  async recordGameMinutes(): Promise<void> {
    try {
      const guild = await this.discordService.getGuild(this.guildId);
      const samples: GameActivitySample[] = [];

      for (const member of guild.members.cache.values()) {
        if (member.user.bot || !member.presence) {
          continue;
        }

        for (const activity of member.presence.activities) {
          // The activity list also carries custom statuses, Spotify, streaming and competing.
          // Only Playing is game time, and a custom status is free text the member wrote.
          if (activity.type !== ActivityType.Playing) {
            continue;
          }

          samples.push({ discordId: member.id, gameName: activity.name });
        }
      }

      if (samples.length === 0) {
        return;
      }

      await this.rollupService.incrementGameMinutes(samples);
    }
    catch (err) {
      this.logger.warn(`Failed to record game minutes: ${err.message}`);
    }
  }
}
