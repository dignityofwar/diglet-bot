import { Command, EventParams, Handler } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction, MessageFlags } from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { AlbionRegistrationRetryCronService } from '../services/albion.registration.retry.cron.service';
import { ConfigService } from '@nestjs/config';

@Command({
  name: 'albion-force-retry',
  type: ApplicationCommandType.ChatInput,
  description: 'Manually trigger the Albion registration retry queue processor.',
})
@Injectable()
export class AlbionForceRetryCommand {
  private readonly logger = new Logger(AlbionForceRetryCommand.name);

  constructor(
    private readonly albionRetryCron: AlbionRegistrationRetryCronService,
    private readonly config: ConfigService,
  ) {}

  @Handler()
  async onAlbionForceRetry(
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<void> {
    // Defensive: avoid hard-crashing if discord-nestjs injection is misconfigured.
    if (!interaction?.[0]) {
      this.logger.error('AlbionForceRetryCommand invoked without an interaction payload');
      return;
    }

    // Check if the command came from the correct channel ID
    const registrationChannelId = this.config.get('discord.channels.albionRegistration');

    // Respond quickly to avoid Discord interaction timeout.
    await interaction[0].reply({
      content: `⏳ Running Albion registration retry now (see <#${registrationChannelId}>)...`,
      flags: MessageFlags.Ephemeral,
    });

    try {
      await this.albionRetryCron.retryAlbionRegistrations();
      await interaction[0].editReply(`✅ Albion registration retry run complete. <#${registrationChannelId}>`);
    }
    catch (err) {
      this.logger.error(err?.message ?? String(err));
      await interaction[0].editReply(`⛔️ Albion registration retry run failed. Pinging <@${this.config.get('discord.devUserId')}>!`);
    }
  }
}
