import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlbionScanDto } from '../dto/albion.scan.dto';
import { AlbionScanningService } from '../services/albion.scanning.service';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class AlbionScanCommand {
  private readonly logger = new Logger(AlbionScanCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly albionScanningService: AlbionScanningService,
  ) {}

  @SlashCommand({
    name: 'albion-scan',
    description: 'Trigger a scan of verified DIG Guild members to ensure they\'re valid members',
  })
  async onAlbionScanCommand(
    @Options() dto: AlbionScanDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.debug('Received Albion Scan Command');

    // Check if the command came from the correct channel ID
    const scanChannelId = this.config.get('discord.channels.albionScans');

    // Check if channel is correct
    if (interaction.channelId !== scanChannelId) {
      return replyTo(interaction, `Please use the <#${scanChannelId}> channel to perform Scans.`);
    }

    const message = await interaction.channel.send('Starting Albion Members scan...');

    this.albionScanningService.startScan(message, dto.dryRun);

    return replyTo(interaction, `Albion Scan initiated!${dto.dryRun ? ' [DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]' : ''}`);
  }
}
