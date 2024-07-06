import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { Logger } from '@nestjs/common';
import { ActivityService } from '../services/activity.service';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { DryRunDto } from '../dto/dry.run.dto';

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
  async onCommand(
    @InteractionEvent(SlashCommandPipe) dto: DryRunDto,
    @EventParams() interaction: ChatInputCommandInteraction[]
  ): Promise<void> {
    const channel = interaction[0].channel;
    const content = 'Initiated activity scan.';

    await interaction[0].reply({
      content,
    });

    if (dto.dryRun) {
      await channel.send('## This is a dry run! No members will be kicked!');
    }

    this.activityService.startScan(interaction[0].channel, dto.dryRun);

    this.logger.log('Activity scan command executed!');
  }
}
