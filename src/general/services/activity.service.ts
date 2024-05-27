import { Injectable, Logger } from '@nestjs/common';
import { GuildTextBasedChannel } from 'discord.js';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {}

  // Gets list of members who are in the activity list who have left and remove them from activity
  async scanAndRemoveLeavers(channel: GuildTextBasedChannel): Promise<void> {
    const statusMessage = await channel.send('Fetching activity records...');

    const allActivityMembers = await this.activityRepository.findAll();
    const leavers: ActivityEntity[] = [];

    let scanCount = 0;

    await statusMessage.edit(`Scanning activity records... 0 of ${allActivityMembers.length}`);

    for (const activeMember of allActivityMembers) {
      scanCount++;

      if (scanCount % 10 === 0 || scanCount === allActivityMembers.length) {
        await statusMessage.edit(`Scanning activity records... ${scanCount} of ${allActivityMembers.length}`);
      }
      try {
        const member = channel.guild.members.cache.get(activeMember.discordId);
        if (!member) {
          await this.activityRepository.removeAndFlush(activeMember);
          leavers.push(activeMember);
        }
        this.logger.log(`Scanned activity record for ${activeMember.discordNickname} (${activeMember.discordId})`);
      }
      catch (err) {
        const error = `Error removing activity record for ${activeMember.discordNickname} (${activeMember.discordId}). Error: ${err.message}`;
        this.logger.error(error);
        channel.send(error);
      }
    }

    const batchMessages = [];
    let messageBatch = '';
    let count = 0;
    for (const leaver of leavers) {
      count++;
      messageBatch += `- Removed ${leaver.discordNickname} (${leaver.discordId})\n`;
      if (count % 10 === 0 || count === leavers.length) {
        batchMessages.push(messageBatch);
        messageBatch = '';
      }
    }

    if (batchMessages.length > 0) {
      for (const batch of batchMessages) {
        await channel.send(batch);
      }
    }

    const remaining = allActivityMembers.length - leavers.length;

    await statusMessage.delete();
    await channel.send(`Activity scan complete. Removed **${leavers.length}** leavers out of activity records. **${remaining}** records remaining.`);
  }

  async getInactives(): Promise<ActivityEntity[]> {
    const allRecords = await this.activityRepository.findAll();

    // Get records that are older than 90 days
    const ninetyDaysAgo = new Date();
    ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

    return allRecords.filter(record => record.lastActivity < ninetyDaysAgo);
  }
}
