import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { Logger } from '@nestjs/common';
import { PurgeService } from '../services/purge.service';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { ThanosSnapDto } from '../dto/thanos.snap.dto';

@Command({
  name: 'thanos-snap',
  type: ApplicationCommandType.ChatInput,
  description: 'Execute a purge of the DIG server.',
})
export class ThanosSnapCommand {
  private readonly logger = new Logger(ThanosSnapCommand.name);

  constructor(
    private readonly purgeService: PurgeService,
  ) {}

  @Handler()

  async onPurgeCandidatesCommand(
    @InteractionEvent(SlashCommandPipe) dto: ThanosSnapDto,
    @EventParams() interaction: ChatInputCommandInteraction[]
  ): Promise<void> {
    const channel = interaction[0].channel;
    await interaction[0].reply('I am... inevitable.');

    await channel.send('https://media.giphy.com/media/ie76dJeem4xBDcf83e/giphy.gif');

    const message = await channel.send('Executing purge command...');

    const purgableMembers = await this.purgeService.getPurgableMembers(message);

    if (purgableMembers.purgableMembers.length === 0) {
      this.logger.log('All members are onboarded!');
      await channel.send('All members are onboarded!');
      return;
    }

    await message.edit(`Found ${purgableMembers.purgableMembers.length} members who are not onboarded...\nI don't feel too good Mr Stark...`);

    // I don't feel too good Mr Stark...
    await message.channel.send('https://media2.giphy.com/media/XzkGfRsUweB9ouLEsE/giphy.gif');

    await this.purgeService.kickPurgableMembers(
      message,
      purgableMembers.purgableMembers,
      dto.dryRun
    );

    await message.channel.send('https://media1.tenor.com/m/g0oFjHy6W1cAAAAC/thanos-smile.gif');

    await message.channel.send(`Purge complete. ${purgableMembers.purgableMembers.length} members have been removed from the server.`);
  }
}
