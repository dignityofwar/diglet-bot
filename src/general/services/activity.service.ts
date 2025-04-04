import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {}

  async removeActivityRecord(
    activityRecord: ActivityEntity,
    dryRun: boolean
  ): Promise<void> {
    try {
      if (!dryRun) {
        await this.activityRepository.getEntityManager().removeAndFlush(activityRecord);
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
