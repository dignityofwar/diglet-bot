import { Injectable, Logger } from '@nestjs/common';
import { Collection, GuildMember, Message, Role } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { EntityRepository } from '@mikro-orm/core';
import { InjectRepository } from '@mikro-orm/nestjs';
import { ActivityService } from './activity.service';
import { ConfigService } from '@nestjs/config';

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
  inactive: number;
}

@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  constructor(
    private readonly discordService: DiscordService,
    private readonly activityService: ActivityService,
    private readonly config: ConfigService,
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {}

  preflightChecks(message: Message) {
    const onboardedRole = message.guild.roles.cache.find(role => role.name === 'Onboarded');
    const ps2Role = message.guild.roles.cache.find(role => role.name === 'Planetside2');
    const ps2VerifiedRole = message.guild.roles.cache.find(role => role.name === 'PS2/Verified');
    const foxholeRole = message.guild.roles.cache.find(role => role.name === 'Foxhole');
    const albionRole = message.guild.roles.cache.find(role => role.name === 'Albion Online');
    const albionUSRegistered = message.guild.roles.cache.find(role => role.name === 'ALB/US/Registered');
    const albionEURegistered = message.guild.roles.cache.find(role => role.name === 'ALB/EU/Registered');

    const devUserId = this.config.get('discord.devUserId');

    // 1. Preflight checks
    if (!onboardedRole) {
      throw new Error(`Could not find Onboarded role! Pinging Bot Dev <@${devUserId}>!`);
    }

    if (!ps2Role) {
      throw new Error(`Could not find Planetside2 role! Pinging Bot Dev <@${devUserId}>!`);
    }

    if (!ps2VerifiedRole) {
      throw new Error(`Could not find PS2/Verified role! Pinging Bot Dev <@${devUserId}>!`);
    }

    if (!foxholeRole) {
      throw new Error(`Could not find Foxhole role! Pinging Bot Dev <@${devUserId}>!`);
    }

    if (!albionRole) {
      throw new Error(`Could not find Albion Online role! Pinging Bot Dev <@${devUserId}>!`);
    }

    if (!albionUSRegistered || !albionEURegistered) {
      throw new Error(`Could not find Albion Online registered role(s)! Pinging Bot Dev <@${devUserId}>!`);
    }

    return {
      onboardedRole,
      ps2Role,
      ps2VerifiedRole,
      foxholeRole,
      albionRole,
      albionUSRegistered,
      albionEURegistered,
    };
  }

  async startPurge(
    originMessage: Message,
    dryRun = true,
    interactionMember: GuildMember | null = null
  ): Promise<void> {
    await originMessage.channel.send('https://media.giphy.com/media/ie76dJeem4xBDcf83e/giphy.gif');

    const statusMessage = await originMessage.channel.send('Snapping fingers...');

    let purgableMembers: PurgableMemberList;

    try {
      purgableMembers = await this.getPurgableMembers(originMessage, dryRun);
    }
    catch (err) {
      const string = `## ❌ Error commencing the purge!\n${err.message}`;
      this.logger.error(string);
      await statusMessage.edit(string);
      return;
    }

    if (purgableMembers.purgableMembers.size === 0) {
      const string = '## ✅ All members are active and onboarded.\nThey have been saved from Thanos, this time...';
      this.logger.log(string);
      await originMessage.channel.send(string);
      return;
    }

    await statusMessage.edit(`Found ${purgableMembers.purgableMembers.size} members who have disobeyed Thanos...\nI don't feel too good Mr Stark...`);

    // I don't feel too good Mr Stark...
    await originMessage.channel.send('https://media2.giphy.com/media/XzkGfRsUweB9ouLEsE/giphy.gif');

    // Let the purge commence...
    try {
      await this.kickPurgableMembers(
        originMessage,
        purgableMembers.purgableMembers,
        dryRun
      );
    }
    catch (err) {
      const string = `## ❌ Error purging members!\n${err.message}`;
      this.logger.error(string);
      await statusMessage.edit(string);
    }

    // Thanos is pleased
    await originMessage.channel.send('https://media1.tenor.com/m/g0oFjHy6W1cAAAAC/thanos-smile.gif');

    await originMessage.channel.send(`## ✅ Purge complete.\n**${purgableMembers.purgableMembers.size}** members have been purged from the server. It is now recommended to run the Scanners found in #albion-scans and #ps2-scans.`);

    if (interactionMember) {
      await originMessage.channel.send(`Thanos thanks you for your service, <@${interactionMember.user.id}>.`);
    }
  }

  async getPurgableMembers(
    message: Message,
    dryRun = true
  ): Promise<PurgableMemberList> {
    let onboardedRole: Role;
    let ps2Role: Role;
    let ps2VerifiedRole: Role;
    let foxholeRole: Role;
    let albionRole: Role;
    let albionUSRegistered: Role;
    let albionEURegistered: Role;

    try {
      const roles = this.preflightChecks(message);
      onboardedRole = roles.onboardedRole;
      ps2Role = roles.ps2Role;
      ps2VerifiedRole = roles.ps2VerifiedRole;
      foxholeRole = roles.foxholeRole;
      albionRole = roles.albionRole;
      albionUSRegistered = roles.albionUSRegistered;
      albionEURegistered = roles.albionEURegistered;
    }
    catch (err) {
      const string = `Preflight checks failed! Err: ${err.message}`;
      this.logger.error(string);
      throw new Error(string);
    }

    // 2. Get a list of active members and hydrate their cache.
    const statusMessage = await message.channel.send('Collating Active Discord Members...');
    // Check the active members, and while we're at it remove any that are no longer on the server.
    const activeMembers = await this.resolveActiveMembers(message, dryRun);

    // 3. Get all members from the cache.
    this.logger.log('Fetching All Discord server members...');
    let members: Collection<string, GuildMember>;
    try {
      members = await message.guild.members.fetch();
    }
    catch (err) {
      const string = `Error fetching Discord server members. Err: ${err.message}`;
      this.logger.error(string);
      await message.channel.send(string);
      return;
    }
    this.logger.log(`${members.size} members found`);
    await statusMessage.edit(`${members.size} members found. Sorting members...`);

    // Sort the members alphabetically, so we don't lose our minds in the output
    members = this.sortMembers(members);
    // Convert to an array for easier slicing and batching.
    const membersArray = Array.from(members.values());
    const batchSize = 25; // Define the size of each batch

    // Refresh the cache of each member
    await statusMessage.edit(`Refreshing member cache [0/${members.size}] (0%)...`);
    for (let m = 0; m < members.size; m += batchSize) {
      const batch = membersArray.slice(m, m + batchSize);
      const promises = batch.map(member => member.fetch());

      try {
        await Promise.all(promises);
      }
      catch (err) {
        const string = `Error refreshing member cache. Err: ${err.message}`;
        await message.channel.send(string);
        this.logger.error(string);
      }

      const percent = Math.floor((m / members.size) * 100);

      await statusMessage.edit(`Refreshing member cache [${m}/${members.size}] (${percent}%)...`);
    }

    await statusMessage.edit('Crunching the numbers...');

    // Filter out bots and people who are onboarded already
    const results = {
      purgableMembers: members.filter(member => this.isPurgable(member, activeMembers, onboardedRole)),
      purgableByGame: {
        ps2: members.filter(member => this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(ps2Role.id)),
        ps2Verified: members.filter(member => this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(ps2VerifiedRole.id)),
        foxhole: members.filter(member => this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(foxholeRole.id)),
        albion: members.filter(member => this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(albionRole.id)),
        albionUSRegistered: members.filter(member => this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(albionUSRegistered.id)),
        albionEURegistered: members.filter(member => this.isPurgable(member, activeMembers, onboardedRole) && member.roles.cache.has(albionEURegistered.id)),
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
      inactive: members.filter(member => {
        if (!activeMembers.has(member.user.id)) {
          return true;
        }
      }).size,
    };

    await statusMessage.delete();

    return results;
  }

  // Builds a map of active members and hydrates their GuildMember objects, for later negative comparison in isPurgable.
  async resolveActiveMembers(message: Message, dryRun: boolean) : Promise<Collection<string, GuildMember>> {
    this.logger.log('Getting active Discord members...');
    let count = 0;

    const activeMembers: Collection<string, GuildMember> = new Collection();
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() - 90);

    const activeRecords = await this.activityRepository.find({
      lastActivity: { $gt: thresholdDate },
    });

    const statusMessage = await message.channel.send(`Getting active Discord members [0/${activeRecords.length}] (0%)...`);

    for (const activeMember of activeRecords) {
      count++;

      if (count % 10 === 0 || count === activeRecords.length) {
        const percent = (Math.floor((count / activeRecords.length) * 100)).toFixed(0);
        const string = `Getting active Discord members [${count}/${activeRecords.length}] (${percent}%)...`;
        await statusMessage.edit(string);
        this.logger.debug(string);
      }
      const guildMember = await this.discordService.getGuildMember(
        message.guild.id,
        activeMember.discordId
      );

      // If the member is not found, remove their activity record as they're no longer on the server as it's pointless to keep it.
      if (!guildMember) {
        await this.activityService.removeActivityRecord(activeMember, dryRun);
        this.logger.warn(`Member ${activeMember.discordId} was not found on the server, removing from activity records.`);
        continue;
      }
      activeMembers.set(
        activeMember.discordId,
        guildMember
      );
    }

    const string = `Detected **${activeMembers.size}** active members!`;
    this.logger.log(string);
    await message.channel.send(string);
    await statusMessage.delete();

    return activeMembers;
  }

  // Determines if a member is purgable or not. Returns true if they are.
  isPurgable(member: GuildMember, activeMembers: Collection<string, GuildMember>, onboardedRole: Role): boolean {
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
    // @See resolveActiveMembers
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
      const date = new Date().toLocaleString();

      if (!dryRun) {
        await this.discordService.kickMember(member, message, `Automatic purge: ${date}`);
        // Removal of activity records is handled by the guildRemoveMember event listener.
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

  sortMembers(members: Collection<string, GuildMember>): Collection<string, GuildMember> {
    return members.sort((a, b) => {
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
  }
}
