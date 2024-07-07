import { Injectable, Logger } from '@nestjs/common';
import { Message, TextChannel } from 'discord.js';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { DiscordService } from '../../discord/discord.service';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    private readonly discordService: DiscordService,
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {}

  // Gets list of members who are in the activity list who have left and remove them from activity
  async startScan(channel: TextChannel, dryRun: boolean): Promise<void> {
    const stepMessage = await channel.send('# Starting Activity Leaver Scan');

    await stepMessage.edit('## 1: Getting active member list...');
    const allActivityMembers = await this.activityRepository.findAll();

    await stepMessage.edit('## 2: Scanning active member records for leavers...');
    await this.scanForLeavers(allActivityMembers, stepMessage, dryRun);

    await stepMessage.delete();
  }

  async scanForLeavers(
    allActivityMembers: ActivityEntity[],
    originMessage: Message,
    dryRun: boolean
  ): Promise<void> {
    let scanCount = 0;
    const batchMessages = [];

    let progressPercent = '0';
    const statusMessage = await originMessage.channel.send(`Scanning member list for leavers... 0 of ${allActivityMembers.length} (${progressPercent}%)`);

    for (const activityMember of allActivityMembers) {
      scanCount++;

      if (scanCount % 10 === 0 || scanCount === allActivityMembers.length) {
        progressPercent = Math.round((scanCount / allActivityMembers.length) * 100).toFixed(0);
        this.logger.debug(`Scanning member list for leavers... ${scanCount} of ${allActivityMembers.length} (${progressPercent}%)`);
        await statusMessage.edit(`Scanning member list for leavers... ${scanCount} of ${allActivityMembers.length} (${progressPercent}%)`);
      }
      try {
        const member = await this.discordService.getGuildMember(originMessage.guildId, activityMember.discordId);
        if (!member) {
          await this.removeActivityRecord(activityMember, originMessage, dryRun);
          batchMessages.push(`- Removed leaver ${activityMember.discordNickname} (${activityMember.discordId}) from activity records.\n`);
        }
        this.logger.debug(`Member ${activityMember.discordNickname} (${activityMember.discordId}) is still active`);
      }
      catch (err) {
        const error = `Error removing activity record for ${activityMember.discordNickname} (${activityMember.discordId}). Error: ${err.message}`;
        this.logger.error(error);
        originMessage.channel.send(error);
      }
    }

    await this.discordService.batchSend(batchMessages, originMessage);
  }

  async removeActivityRecord(
    activityRecord: ActivityEntity,
    originMessage: Message,
    dryRun: boolean
  ): Promise<void> {
    try {
      if (!dryRun) {
        await this.activityRepository.removeAndFlush(activityRecord);
      }
      this.logger.log(`Removed activity record for leaver ${activityRecord.discordNickname} (${activityRecord.discordId})`);
    }
    catch (err) {
      const error = `Error removing activity record for leaver ${activityRecord.discordNickname} (${activityRecord.discordId}). Error: ${err.message}`;
      this.logger.error(error);
      throw new Error(error);
    }
  }
}
