import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityStatsBucket, ActivityStatsEntity } from '../../database/entities/activity.stats.entity';
import { Collection, GuildMember } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { ConfigService } from '@nestjs/config';

interface RoleStats {
  onboarded: number;
  ps2Verified: number;
  albionRegistered: number;
}

@Injectable()
export class ActivityService {
  private readonly logger = new Logger(ActivityService.name);

  constructor(
    @InjectRepository(ActivityStatsEntity) private readonly activityStatsRepository: EntityRepository<ActivityStatsEntity>,
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
  ) {}

  async generate() {
    const discordMembers = await this.getAllMembers();
    const activityRecords = await this.getAllActivityRecords();

    const activityStats = new ActivityStatsEntity({
      activeUsers1d: await this.calculateActivityStats(discordMembers, activityRecords, 1),
      activeUsers2d: await this.calculateActivityStats(discordMembers, activityRecords, 2),
      activeUsers7d: await this.calculateActivityStats(discordMembers, activityRecords, 7),
      activeUsers14d: await this.calculateActivityStats(discordMembers, activityRecords, 14),
      activeUsers30d: await this.calculateActivityStats(discordMembers, activityRecords, 30),
      activeUsers60d: await this.calculateActivityStats(discordMembers, activityRecords, 60),
      activeUsers90d: await this.calculateActivityStats(discordMembers, activityRecords, 90),
    });

    await this.persistStats(activityStats);
  }

  // Gets all the members from Discord, so we can later scan their roles etc.
  async getAllMembers(): Promise<Collection<string, GuildMember>> {
    return await this.discordService.getGuildMembers(process.env.DISCORD_GUILD_ID);
  }

  async getAllActivityRecords(): Promise<Map<string, ActivityEntity>> {
    const entities = await this.activityRepository.findAll();

    const records = new Map<string, ActivityEntity>();

    // Construct the map
    entities.forEach(entity => {
      records.set(entity.discordId, entity);
    });

    return records;
  }

  async calculateActivityStats(
    members: Collection<string, GuildMember>,
    activityRecords: Map<string, ActivityEntity>,
    cutoffDays: number
  ): Promise<ActivityStatsBucket> {
    this.logger.log(`Calculating activity stats for ${cutoffDays} days...`);
    const now = new Date();
    const cutoffDate = new Date(now.setDate(now.getDate() - cutoffDays));

    // We now need to loop through each Discord member and check their last activity record according to the Activity Entity. If the last activity is within the cutoff date, we count them as active.
    const actives = members.filter(member => {
      const activityRecord = activityRecords.get(member.id);

      if (!activityRecord) {
        this.logger.error(`No activity record found for member ${member.displayName} (${member.id})! This should not occur!`);
        return false;
      }

      return activityRecord.lastActivity > cutoffDate;
    });

    const roleStats = await this.calculateRoleCounts(actives);

    const result: ActivityStatsBucket = {
      total: actives.size,
      onboarded: roleStats.onboarded,
      ps2Verified: roleStats.ps2Verified,
      albionRegistered: roleStats.albionRegistered,
    };

    this.logger.log(`Activity stats for ${cutoffDays} days: ${JSON.stringify(result)}`, null, 4);

    return result;
  }

  async calculateRoleCounts(actives: Collection<string, GuildMember>): Promise<RoleStats> {
    // Role IDs
    const onboardedRoleId = this.config.get('discord.roles.onboarded');
    const ps2RoleId = this.config.get('discord.roles.ps2Verified');
    const albionRoleId = this.config.get('discord.roles.albionRegistered');

    if (!onboardedRoleId || !ps2RoleId || !albionRoleId) {
      throw new Error('One or more role IDs are missing from the configuration!');
    }

    let hasOnboarded = 0;
    let hasPS2Verified = 0;
    let hasAlbionRegistered = 0;

    // Now we need to count how many of the active members have the game roles
    actives.forEach(active => {
      if (active.roles.cache.some(role => role.id === onboardedRoleId)) {
        hasOnboarded++;
      }
      if (active.roles.cache.some(role => role.id === ps2RoleId)) {
        hasPS2Verified++;
      }
      if (active.roles.cache.some(role => role.id === albionRoleId)) {
        hasAlbionRegistered++;
      }
    });

    return {
      onboarded: hasOnboarded,
      ps2Verified: hasPS2Verified,
      albionRegistered: hasAlbionRegistered,
    };
  }

  async persistStats(stats: ActivityStatsEntity): Promise<void> {
    this.logger.log('Persisting activity stats...');

    try {
      await this.activityStatsRepository.persistAndFlush(stats);
      this.logger.log('Activity stats persisted successfully!');
    }
    catch (err) {
      const error = `Error persisting activity stats! Error: ${err.message}`;
      this.logger.error(error);
      throw new Error(error);
    }
  }
}
