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
  async onPurgeCandidatesCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    await interaction.reply('Finding the poor souls who are not onboarded...');
    const channel = interaction.channel;

    const message = await channel.send('Calculating purgable members...');

    const purgableMembers = await this.purgeService.getPurgableMembers(message);

    if (purgableMembers.purgableMembers.size === 0) {
      this.logger.log('All members are onboarded!');
      await channel.send('https://static1.srcdn.com/wordpress/wp-content/uploads/2019/02/Thanos-Soul-World-Sad-Face.jpg');
      await channel.send('All members are onboarded or are within grace period! They have been saved from Thanos, for now.');
      await channel.send(`Humans in grace period: **${purgableMembers.inGracePeriod}**`);
      await message.delete();
      return;
    }

    await message.edit(`Found ${purgableMembers.purgableMembers.size} members who are not onboarded or are inactive. Generating list...`);

    this.logger.log('All batches sent.');
    this.logger.log(`Identified ${purgableMembers.purgableMembers.size} members are not onboarded.`);
  }
}
