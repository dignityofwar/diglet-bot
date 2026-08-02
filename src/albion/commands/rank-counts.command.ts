import { Context, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageFlags } from 'discord.js';
import { AlbionRankCountsService } from '../services/albion.rank.counts.service';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class AlbionRankCountsCommand {
  private readonly logger = new Logger(AlbionRankCountsCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly albionRankCountsService: AlbionRankCountsService,
  ) {}

  @SlashCommand({
    name: 'albion-ranks',
    description: 'Show how many members hold each Albion rank and content role',
  })
  async onAlbionRankCountsCommand(
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.debug('Received Albion Rank Counts Command');

    // Fetching the full member list blows Discord's 3s window. Ephemeral so the numbers can be
    // pulled from any channel without spamming it.
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const counts = await this.albionRankCountsService.getRankCounts(this.config.get('discord.guildId'));
      const report = this.albionRankCountsService.formatReport(counts);

      // Enough content roles will outgrow Discord's message limit, so the report may arrive split
      const [firstChunk, ...restChunks] = this.albionRankCountsService.chunkReport(report);

      await replyTo(interaction, firstChunk);

      for (const chunk of restChunks) {
        await interaction.followUp({ content: chunk, flags: MessageFlags.Ephemeral });
      }

      return report;
    }
    catch (err) {
      this.logger.error(`Error getting Albion rank counts: ${err.message}`);
      return replyTo(interaction, `⛔️ **ERROR:** ${err.message}`);
    }
  }
}
