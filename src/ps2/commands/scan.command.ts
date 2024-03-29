import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { Injectable, Logger } from '@nestjs/common';
import { PS2ScanDto } from '../dto/PS2ScanDto';
import { PS2GameScanningService } from '../service/ps2.game.scanning.service';
import { ConfigService } from '@nestjs/config';

@Command({
  name: 'ps2-scan',
  type: ApplicationCommandType.ChatInput,
  description: 'Trigger a scan of verified DIG outfit members to ensure they\'re valid members',
})
@Injectable()
export class PS2ScanCommand {
  private readonly logger = new Logger(PS2ScanCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly ps2GameScanningService: PS2GameScanningService,
  ) {}

  @Handler()
  async onPS2ScanCommand(
    @InteractionEvent(SlashCommandPipe) dto: PS2ScanDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<string> {
    this.logger.debug('Received PS2ScanCommand');

    // Check if the command came from the correct channel ID
    const scanChannelId = this.config.get('discord.channels.ps2Scans');

    // Check if channel is correct
    if (interaction[0].channelId !== scanChannelId) {
      return `Please use the <#${scanChannelId}> channel to perform Scans.`;
    }

    const message = await interaction[0].channel.send('Starting scan...');

    this.ps2GameScanningService.startScan(message, dto.dryRun);

    return `Scan initiated. ${dto.dryRun ? '[DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]' : ''}`;
  }
}
