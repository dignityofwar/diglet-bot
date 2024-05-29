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
    const name = member.displayName || member.nickname || member.user.username || null;
    let entity = await this.activityRepository.findOne({ discordId: member.id });

    // If no result, create a new entity
    if (!entity) {
      entity = new ActivityEntity({
        discordId: member.id,
        discordNickname: name,
      });
    }

    // Update the timestamp and nickname here in all cases, created or not
    entity.discordNickname = name;
    entity.lastActivity = new Date();

    try {
      await this.activityRepository.getEntityManager().persistAndFlush(entity);
      this.logger.verbose(`Updated activity for ${member.id}`);
    }
    catch (err) {
      console.error(err);
      this.logger.error(`Error updating activity for ${member.id}: ${err.message}`);
    }
  }
}
