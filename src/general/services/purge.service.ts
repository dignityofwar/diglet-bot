import { Injectable, Logger } from '@nestjs/common';
import { Collection, GuildMember, Message, Role } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';

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
  ) {}

  async getPurgableMembers(message: Message): Promise<PurgableMemberList> {
    const onboardedRole = message.guild.roles.cache.find(role => role.name === 'Onboarded');
    const ps2Role = message.guild.roles.cache.find(role => role.name === 'Planetside2');
    const ps2VerifiedRole = message.guild.roles.cache.find(role => role.name === 'PS2/Verified');
    const foxholeRole = message.guild.roles.cache.find(role => role.name === 'Foxhole');
    const albionRole = message.guild.roles.cache.find(role => role.name === 'Albion Online');
    const albionUSRegistered = message.guild.roles.cache.find(role => role.name === 'ALB/US/Registered');
    const albionEURegistered = message.guild.roles.cache.find(role => role.name === 'ALB/EU/Registered');

    if (!onboardedRole) {
      await message.channel.send('Could not find onboarded role. Please create a role called "Onboarded" and try again.');
      return;
    }

    if (!ps2Role || !ps2VerifiedRole || !foxholeRole || !albionRole || !albionUSRegistered || !albionEURegistered) {
      await message.channel.send('Could not find game roles. Please create roles called "Planetside2", "Foxhole", and "Albion Online" and try again.');
      return;
    }

    const statusMessage = await message.channel.send('Fetching guild members...');

    this.logger.log('Fetching guild members...');
    let members: Collection<string, GuildMember>;
    try {
      members = await message.guild.members.fetch();
    }
    catch (err) {
      await message.channel.send('Error fetching guild members. Please try again.');
      return;
    }
    await statusMessage.edit(`${members.size} members found. Sorting members by username...`);
    this.logger.log(`${members.size} members found`);

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

    await statusMessage.edit(`Refreshing member cache [0/${members.size}]...`);

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

      await statusMessage.edit(`Refreshing member cache [${m}/${members.size}]...`);
    }

    await statusMessage.delete();

    // Filter out bots and people who are onboarded already
    return {
      purgableMembers: members.filter(member => this.isNotOnboarded(member, onboardedRole)),
      purgableByGame: {
        ps2: members.filter(member => this.isNotOnboarded(member, onboardedRole) && member.roles.cache.has(ps2Role.id)),
        ps2Verified: members.filter(member => this.isNotOnboarded(member, onboardedRole) && member.roles.cache.has(ps2VerifiedRole.id)),
        foxhole: members.filter(member => this.isNotOnboarded(member, onboardedRole) && member.roles.cache.has(foxholeRole.id)),
        albion: members.filter(member => this.isNotOnboarded(member, onboardedRole) && member.roles.cache.has(albionRole.id)),
        albionUSRegistered: members.filter(member => this.isNotOnboarded(member, onboardedRole) && member.roles.cache.has(albionUSRegistered.id)),
        albionEURegistered: members.filter(member => this.isNotOnboarded(member, onboardedRole) && member.roles.cache.has(albionEURegistered.id)),
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
  }

  isNotOnboarded(member: GuildMember, role: Role): boolean {
    if (member.user.bot) {
      return false;
    }
    // Don't boot people brand new to the server, give them 1 weeks grace period
    if (member.joinedTimestamp > Date.now() - 604800000) {
      return false;
    }
    return !member.roles.cache.has(role.id);
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
        await this.discordService.kickMember(member, message, `Purge on ${date}: Not onboarded`);
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
