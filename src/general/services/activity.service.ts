import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { ActivityStatisticsEntity } from '../../database/entities/activity.statistics.entity';

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
    @InjectRepository(ActivityStatisticsEntity) private readonly activityStatisticsRepository: EntityRepository<ActivityStatisticsEntity>,
  ) {}

  async removeActivityRecord(
    activityRecord: ActivityEntity,
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

  async getActivityRecords(): Promise<ActivityEntity[]> {
    try {
      return await this.activityRepository.findAll();
    }
    catch (err) {
      const error = `Error fetching activity records. Error: ${err.message}`;
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async enumerateActivity(): Promise<void> {
    try {
      const activityRecords = await this.getActivityRecords();
      // Perform collating logic here
      this.logger.log(`Collated ${activityRecords.length} activity records`);

      const activeUsers90d = await this.getActiveUserCounts(90, activityRecords);

      // Create the activity statistics entity
      const activityStatistics = new ActivityStatisticsEntity({
        totalUsers: activeUsers90d.inactive + activeUsers90d.active,
        inactiveUsers: activeUsers90d.inactive,
        activeUsers90d: activeUsers90d.active,
        activeUsers60d: (await this.getActiveUserCounts(60, activityRecords)).active,
        activeUsers30d: (await this.getActiveUserCounts(30, activityRecords)).active,
        activeUsers14d: (await this.getActiveUserCounts(14, activityRecords)).active,
        activeUsers7d: (await this.getActiveUserCounts(7, activityRecords)).active,
        activeUsers3d: (await this.getActiveUserCounts(3, activityRecords)).active,
        activeUsers2d: (await this.getActiveUserCounts(2, activityRecords)).active,
        activeUsers1d: (await this.getActiveUserCounts(1, activityRecords)).active,
      });

      // Commit
      await this.activityStatisticsRepository.persistAndFlush(activityStatistics);
    }
    catch (err) {
      const error = `Error enumerating activity records. Error: ${err.message}`;
      this.logger.error(error);
      throw new Error(error);
    }
  }

  async getActiveUserCounts(days: number, activityRecords: ActivityEntity[]): Promise<ActiveUserCounts> {
    try {
      const now = new Date();
      const daysAgo = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      const active = activityRecords.filter(record => record.lastActivity >= daysAgo).length;
      const inactive = activityRecords.length - active;

      return { active, inactive };
    }
    catch (err) {
      const error = `Error updating activity records. Error: ${err.message}`;
      this.logger.error(error);
      throw new Error(error);
    }
  }
}

interface ActiveUserCounts {
  active: number
  inactive: number
}