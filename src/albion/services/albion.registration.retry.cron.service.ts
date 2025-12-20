import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { DiscordService } from '../../discord/discord.service';
import {
  AlbionRegistrationQueueEntity,
  AlbionRegistrationQueueStatus,
} from '../../database/entities/albion.registration.queue.entity';
import { TextChannel } from 'discord.js';
import { AlbionRegistrationService } from './albion.registration.service';
import { AlbionApiService } from './albion.api.service';

@Injectable()
export class AlbionRegistrationRetryCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRegistrationRetryCronService.name);

  private notificationChannel: TextChannel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly configService: ConfigService,
    private readonly albionRegistrationService: AlbionRegistrationService,
    private readonly albionApiService: AlbionApiService,
    @InjectRepository(AlbionRegistrationQueueEntity)
    private readonly albionRegistrationQueueRepository: EntityRepository<AlbionRegistrationQueueEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const channelId = this.configService.get('discord.channels.albionRegistration');

    const channel = await this.discordService.getTextChannel(channelId);
    if (!channel) {
      throw new Error(`Could not find channel with ID ${channelId} for Albion retry cron.`);
    }
    if (!channel.isTextBased()) {
      throw new Error(`Channel with ID ${channelId} is not a text channel for Albion retry cron.`);
    }

    this.notificationChannel = channel;
  }

  @Cron('0 * * * *')
  async retryAlbionRegistrations(): Promise<void> {
    const due = await this.albionRegistrationQueueRepository.find(
      {
        status: AlbionRegistrationQueueStatus.PENDING,
      },
      {
        limit: 50,
        orderBy: { updatedAt: 'ASC' },
      },
    );

    if (!due.length) {
      return;
    }

    // Post a lightweight summary so we can see retries happening.
    await this.postRetrySummary(due);

    this.logger.log(`Processing ${due.length} queued Albion registration attempt(s)`);

    for (const attempt of due) {
      await this.processAttempt(attempt);
    }
  }

  private async processAttempt(attempt: AlbionRegistrationQueueEntity): Promise<void> {
    const now = new Date();

    if (attempt.expiresAt <= now) {
      await this.expireAttempt(attempt);
      return;
    }

    // First, check whether the character is in the guild using the same logic as registration.
    try {
      const guildId = this.configService.get('albion.guildId');
      const inGuild = await this.albionApiService.checkCharacterGuildMembership(
        attempt.characterName,
        attempt.server,
        guildId,
      );

      if (!inGuild) {
        attempt.attemptCount += 1;
        attempt.lastError = 'Character not found in guild yet.';
        await this.albionRegistrationQueueRepository.getEntityManager().flush();
        return;
      }
    }
    catch (err) {
      attempt.attemptCount += 1;
      attempt.lastError = `Failed to fetch guild members: ${err?.message ?? String(err)}`;
      await this.albionRegistrationQueueRepository.getEntityManager().flush();
      return;
    }

    try {
      attempt.attemptCount += 1;
      attempt.lastError = null;

      await this.albionRegistrationQueueRepository.getEntityManager().flush();

      // This is a scheduled attempt, so we must not re-run the normal registration validation that checks for existing queued attempts.
      await this.albionRegistrationService.handleRegistration(
        attempt.characterName,
        attempt.server,
        attempt.discordId,
        attempt.discordGuildId,
        attempt.discordChannelId,
        { queueValidation: false },
      );

      attempt.status = AlbionRegistrationQueueStatus.SUCCEEDED;
      attempt.lastError = null;
      await this.albionRegistrationQueueRepository.getEntityManager().flush();
    }
    catch (err) {
      const message = err?.message ?? String(err);
      attempt.lastError = message;

      // If the error looks like the character isn't in guild (our retryable case), keep it pending.
      // Everything else we treat as failed and we tell the user to try again / contact leadership.
      if (message.includes('has not been detected in')) {
        await this.albionRegistrationQueueRepository.getEntityManager().flush();
        return;
      }

      attempt.status = AlbionRegistrationQueueStatus.FAILED;
      await this.albionRegistrationQueueRepository.getEntityManager().flush();

      await this.notify(
        `⚠️ Albion registration retry failed for <@${attempt.discordId}> (character **${attempt.characterName}**).\n\nReason: ${message}\n\nPlease try again or contact \`@ALB/Archmage\`.`,
      );
    }
  }

  private async postRetrySummary(attempts: AlbionRegistrationQueueEntity[]): Promise<void> {
    try {
      const characters = attempts
        .map((a) => {
          const unixSeconds = Math.floor(a.expiresAt.getTime() / 1000);
          const discordTime = `<t:${unixSeconds}:f>`;
          return `- **${a.characterName}** (expires ${discordTime})`;
        })
        .join('\n');

      await this.notificationChannel.send(
        `Albion registration queue retry attempt: checking ${attempts.length} character(s):\n\n${characters}`,
      );
    }
    catch (err) {
      this.logger.error(`Failed to send retry summary: ${err.message}`);
    }
  }

  private async expireAttempt(attempt: AlbionRegistrationQueueEntity): Promise<void> {
    attempt.status = AlbionRegistrationQueueStatus.EXPIRED;
    await this.albionRegistrationQueueRepository.getEntityManager().flush();

    await this.notify(
      `⏰ <@${attempt.discordId}> your registration attempt timed out. You are either truly not in the guild, or there is another problem. If you are in the guild, you are recommended to play the game for at least 1 hour, then retry registration. If you are not in the guild, then... why are you trying? :P`,
    );
  }

  private async notify(content: string): Promise<void> {
    try {
      await this.notificationChannel.send(content);
    }
    catch (err) {
      this.logger.error(`Failed to send retry notification: ${err.message}`);
    }
  }
}
