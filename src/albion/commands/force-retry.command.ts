import { Command, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { AlbionRegistrationRetryCronService } from '../services/albion.registration.retry.cron.service';

@Command({
  name: 'albion-force-retry',
  type: ApplicationCommandType.ChatInput,
  description: 'Manually trigger the Albion registration retry queue processor.',
})
@Injectable()
export class AlbionForceRetryCommand {
  private readonly logger = new Logger(AlbionForceRetryCommand.name);

  constructor(private readonly albionRetryCron: AlbionRegistrationRetryCronService) {}

  @Handler()
  async onAlbionForceRetry(@InteractionEvent() interaction: ChatInputCommandInteraction[]): Promise<void> {
    // Respond quickly to avoid Discord interaction timeout.
    await interaction[0].reply({
      content: '⏳ Running Albion registration retry now...',
      flags: MessageFlags.Ephemeral,
    });

    try {
      await this.albionRetryCron.retryAlbionRegistrations();
      await interaction[0].editReply('✅ Albion registration retry run complete.');
    }
    catch (err) {
      this.logger.error(err?.message ?? String(err));
      await interaction[0].editReply('⛔️ Albion registration retry run failed. Check logs.');
    }
  }
}

