import { Command, EventParams, Handler } from '@discord-nestjs/core';
import {
  ApplicationCommandType,
  ChatInputCommandInteraction,
} from 'discord.js';
import { Logger } from '@nestjs/common';
import { ActivityReportCronService } from '../services/activity.report.cron.service';

@Command({
  name: 'activity-report',
  type: ApplicationCommandType.ChatInput,
  description: 'Run the Activity Report.',
})
export class ActivityReportCommand {
  private readonly logger = new Logger(ActivityReportCommand.name);

  constructor(
    private readonly activityReportCronService: ActivityReportCronService,
  ) {}

  @Handler()
  async onActivityReportCommand(
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<void> {
    this.logger.log('Executing Activity Enumeration via command');

    await interaction[0].reply('Starting Activity Report via command...');

    await this.activityReportCronService.runReport();
  }
}
