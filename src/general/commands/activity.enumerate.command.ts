import { Command, EventParams, Handler } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { Logger } from '@nestjs/common';
import { ActivityService } from '../services/activity.service';

@Command({
  name: 'activity-report',
  type: ApplicationCommandType.ChatInput,
  description: 'Run the Activity Report.',
})
export class ActivityEnumerateCommand {
  private readonly logger = new Logger(ActivityEnumerateCommand.name);

  constructor(
    private readonly activityService: ActivityService,
  ) {}

  @Handler()
  async onActivityEnumerateCommand(
    @EventParams() interaction: ChatInputCommandInteraction[]
  ): Promise<void> {
    this.logger.log('Executing Activity Enumeration via command');
    const channel = interaction[0].channel;
    const message = await channel.send('Starting Activity Enumeration report via command...');

    this.activityService.startEnumeration(message);
  }
}
