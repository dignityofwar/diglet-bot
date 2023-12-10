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

    message.edit(`Found ${purgableMembers.length} members who are not onboarded. Generating list...`);

    if (purgableMembers.length === 0) {
      this.logger.log('All members are onboarded!');
      await interaction.channel.send('All members are onboarded!');
      return;
    }

    // Loop through the members and send them in batches of 20, appending the .id of each member to a concatenated string to be sent in batches
    const purgableMembersBatched = [];
    let batch = '';
    for (let i = 0; i < purgableMembers.length; i++) {
      batch += `- <@${purgableMembers[i].id}>\n`;
      if (i % 20 === 0 || i === purgableMembers.length - 1) {
        purgableMembersBatched.push(batch);
        batch = '';
      }
    }

    // Send the batches
    for (let i = 0; i < purgableMembersBatched.length; i++) {
      const tempMessage = await interaction.channel.send('foo');
      await tempMessage.edit(purgableMembersBatched[i]);
    }

    this.logger.log(`Found ${purgableMembers.length} batches of 20 members who are not onboarded. Sending batches...`);

    console.log(purgableMembersBatched);

    this.logger.log('All batches sent.');
    this.logger.log(`Identified ${purgableMembers.length} members are not onboarded.`);
  }
}
