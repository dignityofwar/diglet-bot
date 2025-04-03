import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { ActivityStatisticsEntity } from '../../database/entities/activity.statistics.entity';
import { Message } from 'discord.js';

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

  async startEnumeration(message: Message): Promise<void> {
    try {

      this.logger.log('Starting activity enumeration');
      await message.channel.send('Starting daily activity enumeration...');

      let stats: ActivityStatisticsEntity;

      try {
        await this.enumerateActivity();
        this.logger.log('Activity enumeration completed');

        // Get the latest record
        const result = await this.activityStatisticsRepository.find(
          {},
          {
            orderBy: { createdAt: 'desc' },
            limit: 1,
          }
        );

        if (!result) {
          this.logger.error('No activity statistics found');
          await message.channel.send('No activity statistics found');
          return;
        }

        stats = result[0];
      }
      catch (err) {
        const error = `Error enumerating activity records. Error: ${err.message}`;
        this.logger.error(error);
        await message.channel.send(error);
        return;
      }

      const nowSecs = Math.floor(Date.now() / 1000);

      // Create the report
      const report = `# Activity Report <t:${nowSecs}:D>
- Total Users: **${stats.totalUsers}**
- Inactive Users (>90d): **${stats.inactiveUsers}**
- Active Users (<90d): **${stats.activeUsers90d}**
- Active Users (<60d): **${stats.activeUsers60d}**
- Active Users (<30d): **${stats.activeUsers30d}**
- Active Users (<14d): **${stats.activeUsers14d}**
- Active Users (<7d): **${stats.activeUsers7d}**
- Active Users (<3d): **${stats.activeUsers3d}**
- Active Users (<2d): **${stats.activeUsers2d}**
- Active Users (<1d): **${stats.activeUsers1d}**`;
      this.logger.log(report);
      await message.channel.send(report);

      this.logger.log('Activity enumeration completed');
    }
    catch (err) {
      const error = `Error starting activity enumeration. Error: ${err.message}`;
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