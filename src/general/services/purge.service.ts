import { Injectable, Logger } from '@nestjs/common';
import { Collection, GuildMember, Message } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';

export interface PurgableMemberList {
  purgableMembers: Collection<string, GuildMember>;
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

    if (!onboardedRole) {
      await message.channel.send('Could not find onboarded role. Please create a role called "Onboarded" and try again.');
      return;
    }

    const statusMessage = await message.channel.send('Fetching guild members...');

    this.logger.log('Fetching guild members...');
    const members = await message.guild.members.fetch();
    await statusMessage.edit(`${members.size} members found. Sorting members...`);
    this.logger.log(`${members.size} members found`);

    // Sort the members
    members.sort((a, b) => {
      const aName = a.nickname || a.user.username;
      const bName = b.nickname || b.user.username;
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

      await Promise.all(promises);

      await statusMessage.edit(`Refreshing member cache [${m}/${members.size}]...`);
    }

    await statusMessage.delete();

    // Filter out bots and people who are onboarded already
    return {
      purgableMembers: members.filter(member => {
        if (member.user.bot) {
          return false;
        }
        // Don't boot people brand new to the server, give them 1 weeks grace period
        if (member.joinedTimestamp > Date.now() - 604800000) {
          return false;
        }
        return !member.roles.cache.has(onboardedRole.id);
      }),
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

      if (!dryRun) {
        await this.discordService.kickMember(member, message, 'Purge: Not onboarded');
      }
      this.logger.log(`Kicked ${member.nickname || member.user.username} (${member.user.id})`);
      lastKickedString += `- ${prefix}🥾 Kicked ${member.nickname || member.user.username} (${member.user.id})\n`;

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

    this.logger.log(`${purgableMembers.size} members kicked.`);
    await message.channel.send(`${prefix}**${purgableMembers.size}** members kicked.`);
  }
}
