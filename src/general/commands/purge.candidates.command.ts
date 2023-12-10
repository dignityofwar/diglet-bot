import { Command, Handler } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { Logger } from '@nestjs/common';
import { PurgeService } from '../services/purge.service';

@Command({
  name: 'purge-candidates',
  type: ApplicationCommandType.ChatInput,
  description: 'Get a list of members who are not onboarded',
})
export class PurgeCandidatesCommand {
  private readonly logger = new Logger(PurgeCandidatesCommand.name);

  constructor(
    private readonly purgeService: PurgeService,
  ) {}

  @Handler()
  async onPurgeCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply('Executing purge command...');

    const message = await interaction.channel.send('Calculating purgable members...');

    const purgableMembers = await this.purgeService.getPurgableMembers(message);

    message.edit(`Found ${purgableMembers.purgableMembers.length} members who are not onboarded. Generating list...`);

    if (purgableMembers.purgableMembers.length === 0) {
      this.logger.log('All members are onboarded!');
      await interaction.channel.send('All members are onboarded!');
      return;
    }

    // Loop through the members and send them in batches of 20, appending the .id of each member to a concatenated string to be sent in batches
    const purgableMembersBatched = [];
    let batch = '';
    for (let i = 0; i < purgableMembers.purgableMembers.length; i++) {
      const member = purgableMembers.purgableMembers[i];
      batch += `- <@${member.id}> / ${member.user.username},  joined <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n`;
      if (i % 20 === 0 || i === purgableMembers.purgableMembers.length - 1) {
        purgableMembersBatched.push(batch);
        batch = '';
      }
    }

    // Send the batches
    for (let i = 0; i < purgableMembersBatched.length; i++) {
      const tempMessage = await interaction.channel.send('foo');
      await tempMessage.edit(purgableMembersBatched[i]);
    }

    this.logger.log(`Found ${purgableMembersBatched.length} batches of 20 members who are not onboarded. Sending batches...`);

    await interaction.channel.send(`List complete.\n 
- Total members: **${purgableMembers.totalMembers}**
- Total bots: **${purgableMembers.totalBots}**
- Total humans: **${purgableMembers.totalHumans}**
- Total human members who are not onboarded: **${purgableMembers.purgableMembers.length}**`);

    this.logger.log('All batches sent.');
    this.logger.log(`Identified ${purgableMembers.purgableMembers.length} members are not onboarded.`);
  }
}
