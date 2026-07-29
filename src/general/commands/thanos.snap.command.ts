import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { PurgeService } from '../services/purge.service';
import { DryRunDto } from '../dto/dry.run.dto';

@Injectable()
export class ThanosSnapCommand {
  private readonly logger = new Logger(ThanosSnapCommand.name);

  constructor(
    private readonly purgeService: PurgeService,
  ) {}

  @SlashCommand({
    name: 'thanos-snap',
    description: 'Execute a purge of the DIG server.',
  })
  async onThanosSnapCommand(
    @Options() dto: DryRunDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<void> {
    this.logger.log('Executing Thanos Snap Command');
    // Omitting the option must mean a dry run, never a real purge.
    const dryRun = dto.dryRun ?? true;
    const channel = interaction.channel;
    await interaction.reply('I am... inevitable.');

    if (dryRun) {
      await channel.send('## This is a dry run! No members will be kicked!');
    }

    const message = await channel.send('https://media.giphy.com/media/ie76dJeem4xBDcf83e/giphy.gif');

    this.purgeService.startPurge(message, dryRun);
  }
}
