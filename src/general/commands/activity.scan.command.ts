import { Command, Handler } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { Logger } from '@nestjs/common';
import { ActivityService } from '../services/activity.service';

@Command({
  name: 'activity-scan',
  type: ApplicationCommandType.ChatInput,
  description: 'Scans activity data and removes leavers',
})
export class ActivityScanCommand {
  private readonly logger = new Logger(ActivityScanCommand.name);
  constructor(
    private readonly activityService: ActivityService,
  ) {}
  @Handler()
  async onCommand(interaction: ChatInputCommandInteraction): Promise<void> {

    const content = 'Initiated activity scan.';

    await interaction.reply({
      content,
    });

    this.activityService.scanAndRemoveLeavers(interaction.channel);

    this.logger.log('Activity scan command executed!');
  }
}
