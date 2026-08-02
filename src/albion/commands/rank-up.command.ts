import { Context, SlashCommand, SlashCommandContext } from 'necord';
import { GuildMember, MessageFlags } from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { AlbionRankUpService } from '../services/albion.rank.up.service';

@Injectable()
export class AlbionRankUpCommand {
  private readonly logger = new Logger(AlbionRankUpCommand.name);

  constructor(
    private readonly albionRankUpService: AlbionRankUpService,
  ) {}

  @SlashCommand({
    name: 'albion-rank-up',
    description: 'Request a rank up within the DIG Albion Online guild',
  })
  async onAlbionRankUpCommand(
    @Context() [interaction]: SlashCommandContext,
  ): Promise<void> {
    // Every response here is private to the requester, so reply ephemerally up front
    await interaction.reply({
      content: '🔍 Checking your eligibility...',
      flags: MessageFlags.Ephemeral,
    });

    try {
      const outcome = await this.albionRankUpService.handleRankUpRequest(interaction.member as GuildMember);
      await interaction.editReply(outcome.reply);
    }
    catch (err) {
      this.logger.error(`Error handling rank up request: ${err.message}`);
      await interaction.editReply(`⛔️ **ERROR:** ${err.message}`);
    }
  }
}
