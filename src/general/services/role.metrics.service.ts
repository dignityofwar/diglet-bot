import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { Collection, Guild, Message, Role, Snowflake } from 'discord.js';
import { getChannel } from '../../discord/discord.hacks';
import { RoleMetricsEntity } from '../../database/entities/role.metrics.entity';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { generateDateInPast } from '../../helpers';
import { DiscordService } from '../../discord/discord.service';

export interface RoleList {
  onboardedRole: Role;
  communityGameRoles: Collection<Snowflake, Role>;
  recGameRoles: Collection<Snowflake, Role>;
}

@Injectable()
export class RoleMetricsService {
  private readonly logger = new Logger(RoleMetricsService.name);

  private readonly onboarded = 'Onboarded';
  private readonly trackedCommunityGames = ['Albion Online', 'Foxhole'];
  private readonly activeDayThreshold = 90; // 90 days

  constructor(
    @InjectRepository(RoleMetricsEntity)
    private readonly roleMetricsRepository: EntityRepository<RoleMetricsEntity>,
    @InjectRepository(ActivityEntity)
    private readonly activityRepository: EntityRepository<ActivityEntity>,
    private readonly discordService: DiscordService,
  ) {}

  async startEnumeration(message: Message): Promise<void> {
    this.logger.log('Starting role metrics enumeration');

    try {
      // Get the guild from the message
      const guild = getChannel(message).guild;
      if (!guild) {
        const error = 'Guild not found!';
        this.logger.error(error);
        await getChannel(message).send(error);
        return;
      }

      const roleIds = await this.enumerateRoleIds(guild);
      await this.enumerateRoleMetrics(roleIds, guild);
    }
    catch (err) {
      const error = `Error enumerating role metrics. Error: ${err.message}`;
      this.logger.error(error);
      await getChannel(message).send(error);
      return;
    }

    // Get today's record
    // Create a date and set it to be midnight of the day it was run
    const date = new Date();
    date.setHours(0, 0, 0, 0);
    // Check if there is already a report on the same date
    const stat = await this.roleMetricsRepository.findOne({ createdAt: date });

    if (!stat?.id) {
      const error = 'No role metrics found!';
      this.logger.error(error);
      await getChannel(message).send(error);
      return;
    }

    // Sort the communityGames by the value
    stat.communityGames = Object.fromEntries(
      Object.entries(stat.communityGames).sort(([, a], [, b]) => b - a),
    );
    stat.recGames = Object.fromEntries(
      Object.entries(stat.recGames).sort(([, a], [, b]) => b - a),
    );

    // Since the role metrics are stored as JSON objects, we will have to deconstruct them into legible strings.
    // Each communityGame and recGame is in the format of:
    // {"Albion Online": 5, "Foxhole": 10}
    // We will need to get the keys and values, and format them into a string
    const communityGames = Object.entries(stat.communityGames)
      .map(([key, value]) => {
        const percentage = ((value / stat.onboarded) * 100).toFixed(1);
        return `  - ${key}: **${value}** (${percentage}%)`;
      })
      .join('\n');
    const recGames = Object.entries(stat.recGames)
      .map(([key, value]) => {
        const percentage = ((value / stat.onboarded) * 100).toFixed(1);
        return `  - ${key}: **${value}** (${percentage}%)`;
      })
      .join('\n');
    const onboarded = stat.onboarded;

    // Format the report
    const report = `## Role Metrics Report:
Stats as of April 5th 2025. All statistics state members who have the role AND are active <90d.
- Onboarded: **${onboarded}**
- Community Games
${communityGames}
- Rec Games
${recGames}
`;
    // Send a message to the channel with the report
    await getChannel(message).send(report);
    this.logger.log(report);
    this.logger.log('Role metrics enumeration completed.');
  }

  async enumerateRoleIds(guild: Guild): Promise<RoleList> {
    this.logger.log('Starting role ID enumeration');

    // Get all roles from the guild, uncached
    const roles = await this.discordService.getAllRolesFromGuild(guild);
    if (!roles || roles.size === 0) {
      throw new Error('Roles not found!');
    }

    // Find the Onboarded role
    const onboardedRole = roles.find((role) => role.name === this.onboarded);
    if (!onboardedRole) {
      throw new Error('Onboarded role not found!');
    }

    // Find the tracked community game roles
    const communityGameRoles = roles.filter((role) =>
      this.trackedCommunityGames.includes(role.name),
    );

    if (communityGameRoles.size === 0) {
      throw new Error('Community game roles not found!');
    }

    // Find all roles with the 'Rec/' prefix
    const recGameRoles = roles.filter((role) => role.name.startsWith('Rec/'));
    if (recGameRoles.size === 0) {
      throw new Error('Rec game roles not found!');
    }

    // Filter out any Rec/*/X roles, we don't want to count those.
    // Any roles that contain a second slash will be filtered out.
    const filteredRecGameRoles = recGameRoles.filter((role) => {
      const name = role.name;
      const slashCount = (name.match(/\//g) || []).length;
      return slashCount === 1;
    });

    return {
      onboardedRole: onboardedRole,
      communityGameRoles: communityGameRoles,
      recGameRoles: filteredRecGameRoles,
    };
  }

  async enumerateRoleMetrics(roles: RoleList, guild: Guild): Promise<void> {
    this.logger.log('Starting role metrics enumeration...');

    // Get the members from the guild
    const members = await guild.members.fetch();
    if (!members) {
      throw new Error('Discord Guild Members not found!');
    }

    const activeMembers = await this.getActiveMembers();

    // Get the onboarded role counts
    const onboardedRoleCount = members.filter(
      (member) =>
        member.roles.cache.has(roles.onboardedRole.id) &&
        activeMembers.some(
          (activeMember) =>
            activeMember.discordId === member.id &&
            activeMember.lastActivity >
              generateDateInPast(this.activeDayThreshold),
        ),
    ).size;

    // Get the community game role counts, using the role name as a key
    const communityGameRoleCounts = roles.communityGameRoles.map((role) => {
      // Evalulate each member against:
      // 1. They have the role
      // 2. They are active using activeMembers and their discord id
      const size = members.filter(
        (member) =>
          member.roles.cache.has(role.id) &&
          activeMembers.some(
            (activeMember) =>
              activeMember.discordId === member.id &&
              activeMember.lastActivity >
                generateDateInPast(this.activeDayThreshold),
          ),
      ).size;
      return [role.name, size];
    });
    // Reduce the array to an object of key-value pairs
    // e.g. [{"Albion Online": 5}, {"Foxhole": 10}]
    const communityGames = Object.fromEntries(communityGameRoleCounts);

    // Get the rec game role counts
    const recGameRoleCounts = roles.recGameRoles.map((role) => {
      const size = members.filter(
        (member) =>
          member.roles.cache.has(role.id) &&
          activeMembers.some(
            (activeMember) =>
              activeMember.discordId === member.id &&
              activeMember.lastActivity >
                generateDateInPast(this.activeDayThreshold),
          ),
      ).size;
      return [role.name, size];
    });
    // Reduce the array to an object of key-value pairs
    // [{"Rec/BestGameEver": 5}, {"Rec/PS2/Leader": 10}]
    const recGames = Object.fromEntries(recGameRoleCounts);

    // Set createdAt to the current date at midnight
    const createdAt = new Date();
    createdAt.setHours(0, 0, 0, 0);

    // If there is already a record, delete it
    const existingRecords = await this.roleMetricsRepository.find({
      createdAt,
    });
    if (existingRecords) {
      await this.roleMetricsRepository
        .getEntityManager()
        .removeAndFlush(existingRecords);
    }

    // Create the role metrics entity
    const roleMetrics = new RoleMetricsEntity({
      createdAt,
      updatedAt: createdAt,
      onboarded: onboardedRoleCount ?? 0,
      communityGames,
      recGames,
    });

    // Persist the entity to the database
    await this.roleMetricsRepository
      .getEntityManager()
      .persistAndFlush(roleMetrics);

    this.logger.log('Role metrics enumeration completed.');
  }

  async getActiveMembers(): Promise<ActivityEntity[]> {
    this.logger.log('Getting active members');

    // Get the active members from the activity repository
    const activeMembers = await this.activityRepository.findAll();
    const activityDateCutoff = generateDateInPast(this.activeDayThreshold);

    return activeMembers.filter(
      (member) => member.lastActivity > activityDateCutoff,
    );
  }
}
