import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { PS2ScanDto } from '../dto/PS2ScanDto';
import { PS2GameScanningService } from '../service/ps2.game.scanning.service';
import { ConfigService } from '@nestjs/config';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class PS2ScanCommand {
  private readonly logger = new Logger(PS2ScanCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ps2GameScanningService: PS2GameScanningService,
  ) {}

  @SlashCommand({
    name: 'ps2-scan',
    description: 'Trigger a scan of verified DIG outfit members to ensure they\'re valid members',
  })
  async onPS2ScanCommand(
    @Options() dto: PS2ScanDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.debug('Received PS2ScanCommand');

    // Check if the command came from the correct channel ID
    const scanChannelId = this.config.get('discord.channels.ps2Scans');

    // Check if channel is correct
    if (interaction.channelId !== scanChannelId) {
      return replyTo(interaction, `Please use the <#${scanChannelId}> channel to perform Scans.`);
    }

    const message = await interaction.channel.send('Starting scan...');

    this.ps2GameScanningService.startScan(message, dto.dryRun);

    return replyTo(interaction, `Scan initiated. ${dto.dryRun ? '[DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]' : ''}`);
  }
}
