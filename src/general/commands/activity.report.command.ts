import { Context, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { ActivityReportCronService } from '../services/activity.report.cron.service';

@Injectable()
export class ActivityReportCommand {
  private readonly logger = new Logger(ActivityReportCommand.name);

  constructor(
    private readonly activityReportCronService: ActivityReportCronService,
  ) {}

  @SlashCommand({
    name: 'activity-report',
    description: 'Run the Activity Report.',
  })
  async onActivityReportCommand(
    @Context() [interaction]: SlashCommandContext,
  ): Promise<void> {
    this.logger.log('Executing Activity Enumeration via command');

    await interaction.reply('Starting Activity Report via command...');

    await this.activityReportCronService.runReport();
  }
}
