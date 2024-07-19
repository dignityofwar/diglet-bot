import { Command, EventParams, Handler } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { AlbionDiscordActivityReport } from '../../services/reports/albion.discord.activity.report';

@Command({
  name: 'albion-activity-report',
  type: ApplicationCommandType.ChatInput,
  description: 'Run the Albion Discord Activity Report.',
})
@Injectable()
export class AlbionDiscordActivityReportCommand {
  private readonly logger = new Logger(AlbionDiscordActivityReportCommand.name);

  constructor(
    private readonly albionDiscordActivityReport: AlbionDiscordActivityReport
  ) {
  }

  @Handler()
  async onCommand(
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<void> {
    this.logger.debug('Received Albion Discord Activity Report Command');

    await this.albionDiscordActivityReport.runReport(interaction[0].channel);

    await interaction[0].reply('Running report...');
  }
}
