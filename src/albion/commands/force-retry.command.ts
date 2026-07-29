import { Context, SlashCommand, SlashCommandContext } from 'necord';
import { MessageFlags } from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { AlbionRegistrationRetryCronService } from '../services/albion.registration.retry.cron.service';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AlbionForceRetryCommand {
  private readonly logger = new Logger(AlbionForceRetryCommand.name);

  constructor(
    private readonly albionRetryCron: AlbionRegistrationRetryCronService,
    private readonly config: ConfigService,
  ) {}

  @SlashCommand({
    name: 'albion-force-retry',
    description: 'Manually trigger the Albion registration retry queue processor.',
  })
  async onAlbionForceRetry(
    @Context() context: SlashCommandContext,
  ): Promise<void> {
    // Defensive: avoid hard-crashing if the context arrives empty.
    const interaction = context?.[0];
    if (!interaction) {
      this.logger.error('AlbionForceRetryCommand invoked without an interaction payload');
      return;
    }

    // Check if the command came from the correct channel ID
    const registrationChannelId = this.config.get('discord.channels.albionRegistration');

    // Respond quickly to avoid Discord interaction timeout.
    await interaction.reply({
      content: `⏳ Running Albion registration retry now (see <#${registrationChannelId}>)...`,
      flags: MessageFlags.Ephemeral,
    });

    try {
      await this.albionRetryCron.retryAlbionRegistrations();
      await interaction.editReply(`✅ Albion registration retry run complete. <#${registrationChannelId}>`);
    }
    catch (err) {
      this.logger.error(err?.message ?? String(err));
      await interaction.editReply(`⛔️ Albion registration retry run failed. Pinging <@${this.config.get('discord.devUserId')}>!`);
    }
  }
}
