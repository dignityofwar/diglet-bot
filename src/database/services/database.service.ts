import { Injectable, Logger } from '@nestjs/common';
import { GuildMember } from 'discord.js';
import { ActivityEntity } from '../entities/activity.entity';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';

@Injectable()
export class DatabaseService {
  private readonly logger = new Logger(DatabaseService.name);

  constructor(
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {
  }

  // Update the activity for a member, updating their lastActivity timestamp
  async updateActivity(member: GuildMember): Promise<void> {
    let entity = await this.activityRepository.findOne({ discordId: member.id });

    // If no result, create a new entity
    if (!entity) {
      entity = new ActivityEntity({
        discordId: member.id,
        discordNickname: member.displayName,
      });
    }

    // Update the timestamp and nickname here in all cases, created or not
    entity.discordNickname = member.displayName;
    entity.lastActivity = new Date();

    try {
      await this.activityRepository.persistAndFlush(entity);
      this.logger.debug(`Updated activity for ${member.id}`);
    }
    catch (err) {
      console.error(err);
      this.logger.error(`Error updating activity for ${member.id}: ${err.message}`);
    }
  }

  getInactiveThreshold() {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 90);
    return thresholdDate;
  }

  async getActives() {
    return await this.activityRepository.find({
      lastActivity: { $gt: this.getInactiveThreshold() },
    });
  }
}
