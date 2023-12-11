import { Injectable, Logger } from '@nestjs/common';
import { Collection, GuildMember, Message } from 'discord.js';

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

    // Refresh the cache of each member
    let c = 0;
    for (const member of members.values()) {
      c++;

      if (c % 5 === 0) {
        await statusMessage.edit(`Refreshing member cache [${c}/${members.size}]...`);
      }
      await member.fetch();
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
    const statusMessage = await message.channel.send(`Kicking ${purgableMembers.size} purgable members...`);
    const lastKickedMessage = await message.channel.send('Awaiting first kick...');

    this.logger.log(`Kicking ${purgableMembers.size} purgable members...`);
    let count = 0;
    const total = purgableMembers.size;

    purgableMembers.every(async member => {
      count++;
      // Every 5 members, edit the status message
      if (count % 5 === 0) {
        const percent = Math.floor((count / total) * 100);
        await lastKickedMessage.edit(`Kicking ${member.nickname || member.user.username} (${member.id}) [${count}/${total}] (${percent}%)`);
      }

      try {
        if (!dryRun) {
          await member.kick('Purged: Has not onboarded.');
        }
        this.logger.log(`Kicked member ${member.user.username} (${member.id})`);
      }
      catch (err) {
        this.logger.error(`Failed to kick member ${member.user.username} (${member.id})`);
        message.channel.send(`⚠️ Failed to kick member <@${member.id}>! Err: ${err.message}`);
      }
    });

    this.logger.log('All purgable members kicked.');
    await statusMessage.edit('All purgable members kicked.');
    await lastKickedMessage.delete();
  }
}
