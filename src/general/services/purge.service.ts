import { Injectable, Logger } from '@nestjs/common';
import { GuildMember, Message } from 'discord.js';

@Injectable()
export class PurgeService {
  private readonly logger = new Logger(PurgeService.name);

  async getPurgableMembers(message: Message): Promise<GuildMember[]> {
    const onboardedRole = message.guild.roles.cache.find(role => role.name === 'Onboarded');

    if (!onboardedRole) {
      await message.channel.send('Could not find onboarded role. Please create a role called "Onboarded" and try again.');
      return;
    }

    const statusMessage = await message.channel.send('Fetching guild members...');

    this.logger.log('Fetching guild members...');
    const members = [];
    message.guild.members.cache.forEach(member => {
      members.push(member);
    });
    this.logger.log(`${members.length} members found`);

    await statusMessage.edit(`Calculating out of ${members.length} non-bot members who are not onboarded...`);
    // Filter out bots and people who are onboarded already
    return members.filter(member => {
      return !member.user.bot && !member.roles.cache.has(onboardedRole.id);
    });
  }
}
