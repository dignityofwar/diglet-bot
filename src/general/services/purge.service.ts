import { Injectable, Logger } from '@nestjs/common';
import { GuildMember, Message } from 'discord.js';

export interface PurgableMemberList {
  purgableMembers: GuildMember[];
  totalMembers: number;
  totalBots: number;
  totalHumans: number;
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
    const members: GuildMember[] = [];
    message.guild.members.cache.forEach(member => {
      members.push(member);
    });
    this.logger.log(`${members.length} members found`);

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

    await statusMessage.edit(`Calculating out of ${members.length} non-bot members who are not onboarded...`);
    // Filter out bots and people who are onboarded already
    return {
      purgableMembers: members.filter(member => !member.user.bot && !member.roles.cache.has(onboardedRole.id)),
      totalMembers: members.length,
      totalBots: members.filter(member => member.user.bot).length,
      totalHumans: members.filter(member => !member.user.bot).length,
    };
  }
}
