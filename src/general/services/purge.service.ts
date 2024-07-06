import { Injectable, Logger } from '@nestjs/common';
import { Collection, GuildMember, Message, Role } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';

export interface PurgableMemberList {
  purgableMembers: Collection<string, GuildMember>;
  purgableByGame: {
    ps2: Collection<string, GuildMember>;
    ps2Verified: Collection<string, GuildMember>;
    foxhole: Collection<string, GuildMember>;
    albion: Collection<string, GuildMember>;
    albionUSRegistered: Collection<string, GuildMember>;
    albionEURegistered: Collection<string, GuildMember>;
  }
  totalMembers: number;
  totalBots: number;
  totalHumans: number;
  inGracePeriod: number;
}

@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly discordService: DiscordService,
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {}

  async getPurgableMembers(message: Message): Promise<PurgableMemberList> {
    const onboardedRole = message.guild.roles.cache.find(role => role.name === 'Onboarded');
    const ps2Role = message.guild.roles.cache.find(role => role.name === 'Planetside2');
    const ps2VerifiedRole = message.guild.roles.cache.find(role => role.name === 'PS2/Verified');
    const foxholeRole = message.guild.roles.cache.find(role => role.name === 'Foxhole');
    const albionRole = message.guild.roles.cache.find(role => role.name === 'Albion Online');
    const albionUSRegistered = message.guild.roles.cache.find(role => role.name === 'ALB/US/Registered');
    const albionEURegistered = message.guild.roles.cache.find(role => role.name === 'ALB/EU/Registered');

    // 1. Preflight
    if (!onboardedRole) {
      await message.channel.send('Could not find onboarded role. Please create a role called "Onboarded" and try again.');
      return;
    }

    if (!ps2Role || !ps2VerifiedRole || !foxholeRole || !albionRole || !albionUSRegistered || !albionEURegistered) {
      await message.channel.send('Could not find game roles. Please create roles called "Planetside2", "Foxhole", and "Albion Online" and try again.');
      return;
    }

    // 2. Get a list of members who have been inactive for more than 3 months, and exclude them from the below cache bust cos we're gonna boot them anyway
    // Removes the need to do useless queries to Discord which are time intensive.

    const statusMessage = await message.channel.send('Collating inactive members...');
    const activeMembers = await this.getActiveMembers(message);

    this.logger.log(`Found ${activeMembers.size} active members`);
    await message.channel.send(`Detected **${activeMembers.size}** active members!`);

    this.logger.log('Fetching Discord server members...');
    let members: Collection<string, GuildMember>;
    try {
      members = await message.guild.members.fetch();
    }
    catch (err) {
      await message.channel.send('Error fetching Discord server members. Please try again.');
      return;
    }
    this.logger.log(`${members.size} members found`);
    await statusMessage.edit(`${members.size} members found. Sorting members...`);

    // Filter the members that are in

    // Sort the members
    members.sort((a, b) => {
      const aName = a.displayName || a.nickname || a.user.username;
      const bName = b.displayName || b.nickname || b.user.username;
      if (aName < bName) {
        return -1;
      }
      if (aName > bName) {
        return 1;
      }
      return 0;
    });

    await statusMessage.edit(`Refreshing member cache [0/${members.size}] (0%)...`);

    const batchSize = 25; // Define the size of each batch

    // Refresh the cache of each member
    for (let m = 0; m < members.size; m += batchSize) {
      const membersArray = Array.from(members.values());
      const batch = membersArray.slice(m, m + batchSize);
      const promises = batch.map(member => member.fetch());

      try {
        await Promise.all(promises);
      }
      catch (err) {
        await message.channel.send(`Error refreshing member cache: ${err.message}`);
        this.logger.error(`Error refreshing member cache: ${err.message}`);
        console.log(batch);
      }

      const percent = Math.floor((m / members.size) * 100);

      await statusMessage.edit(`Refreshing member cache [${m}/${members.size}] (${percent}%)...`);
    }

    await statusMessage.edit('Crunching the numbers...');

    // Filter out bots and people who are onboarded already
    const results = {
      purgableMembers: members.filter(async member => await this.isPurgable(member, activeMembers, onboardedRole)),
      purgableByGame: {
        ps2: members.filter(async member => await this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(ps2Role.id)),
        ps2Verified: members.filter(async member => await this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(ps2VerifiedRole.id)),
        foxhole: members.filter(async member => await this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(foxholeRole.id)),
        albion: members.filter(async member => await this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(albionRole.id)),
        albionUSRegistered: members.filter(async member => await this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(albionUSRegistered.id)),
        albionEURegistered: members.filter(async member => await this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(albionEURegistered.id)),
      },
      totalMembers: members.size,
      totalBots: members.filter(member => member.user.bot).size,
      totalHumans: members.filter(member => !member.user.bot).size,
      inGracePeriod: members.filter(member => {
        // If in 1 weeks grace period
        if (member.joinedTimestamp > Date.now() - 604800000) {
          return true;
        }
      }).size,
    };

    await statusMessage.delete();

    return results;
  }

  // Builds a map of active members and hydrates their GuildMember objects, for later comparison in isPurgable.
  async getActiveMembers(message: Message) : Promise<Collection<string, GuildMember>> {
    this.logger.log('Getting active Discord members...');

    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 90);

    const actives = await this.activityRepository.find({
      lastActivity: { $gt: thresholdDate },
    });

    const activeMembers: Collection<string, GuildMember> = new Collection();
    for (const member of actives) {
      activeMembers.set(
        member.discordId,
        await this.discordService.getGuildMember(
          message.guild.id,
          member.discordId
        )
      );
    }

    return activeMembers;
  }

  async isPurgable(member: GuildMember, activeMembers: Collection<string, GuildMember>, onboardedRole: Role): Promise<boolean> {
    // Ignore bots.
    if (member.user.bot) {
      return false;
    }

    const weekInMs = 604800000;
    // Don't boot people brand new to the server, give them 1 weeks grace period.
    if (member.joinedTimestamp > Date.now() - weekInMs) {
      return false;
    }

    // If not in the active members map, and are outside their grace period, boot them.
    if (!activeMembers.has(member.user.id)) {
      return true;
    }

    // If all else does not match, if they don't have the onboarded role, boot them.
    return !member.roles.cache.has(onboardedRole.id);
  }

  async kickPurgableMembers(
    message: Message,
    purgableMembers: Collection<string, GuildMember>,
    dryRun = true
  ): Promise<void> {
    await message.channel.send(`Kicking ${purgableMembers.size} purgable members...`);
    let lastKickedMessage = await message.channel.send('Kicking started...');

    this.logger.log(`Kicking ${purgableMembers.size} purgable members...`);
    let count = 0;
    const total = purgableMembers.size;
    let lastKickedString = '';
    const prefix = `${dryRun ? '[DRY RUN] ' : ''}`;

    for (const member of purgableMembers.values()) {
      count++;

      const name = member.displayName || member.nickname || member.user.username;
      const date = new Date(member.joinedTimestamp).toLocaleString();

      if (!dryRun) {
        await this.discordService.kickMember(member, message, `Automatic purge on ${date}`);
      }
      this.logger.log(`Kicked ${name} (${member.user.id})`);
      lastKickedString += `- ${prefix}🥾 Kicked ${name} (${member.user.id})\n`;

      // Every 5 members or last member, send a status update
      if (count % 5 === 0 || count === total) {
        const percent = Math.floor((count / total) * 100);
        const progress = `[${count}/${total}] (${percent}%)`;
        await message.channel.send(lastKickedString);
        lastKickedString = '';

        await this.discordService.deleteMessage(lastKickedMessage); // Deletes last message, so we can re-new it and bring progress to the bottom
        lastKickedMessage = await message.channel.send(`${prefix}🫰 Kicking progress: ${progress}`);

        this.logger.log(`Kicking progress: ${progress}`);
      }
    }

    this.logger.log(`${purgableMembers.size} members purged.`);
    await message.channel.send(`${prefix}**${purgableMembers.size}** members purged.`);
  }
}
