import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { MessageFlags } from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { AlbionRankProgressService } from '../services/albion.rank.progress.service';
import { AlbionSeedRankDatesDto } from '../dto/albion.seed.rank.dates.dto';

@Injectable()
export class AlbionSeedRankDatesCommand {
  private readonly logger = new Logger(AlbionSeedRankDatesCommand.name);

  constructor(
    private readonly rankProgressService: AlbionRankProgressService,
  ) {}

  @SlashCommand({
    name: 'albion-seed-rank-dates',
    description: 'One off: stamp today as the rank date for current Graduates and Adepts',
  })
  async onSeedRankDatesCommand(
    @Options() dto: AlbionSeedRankDatesDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<void> {
    // Fetching every member takes well over Discord's 3s window
    await interaction.reply({
      content: '🔍 Fetching every guild member and checking their ranks...',
      flags: MessageFlags.Ephemeral,
    });

    // necord ignores DTO field initialisers, so the default belongs here
    const dryRun = dto.dryRun ?? false;

    try {
      const result = await this.rankProgressService.seedExistingRanks(dryRun);

      await interaction.editReply([
        dryRun ? '## 🧪 Dry run — nothing was written' : '## ✅ Rank dates backfilled',
        `- Registrations checked: **${result.registrations}**`,
        `- Graduate dates ${dryRun ? 'to set' : 'set'}: **${result.graduates}**`,
        `- Adept dates ${dryRun ? 'to set' : 'set'}: **${result.adepts}**`,
        `- Already had a date, left alone: **${result.alreadySet}**`,
        `- Registered but no longer in the server: **${result.notInServer}**`,
        '',
        '-# We have no record of when anyone was actually promoted, so everyone backfilled gets today. Re-running is safe: it only ever fills blanks.',
      ].join('\n'));
    }
    catch (err) {
      this.logger.error(`Failed to seed rank dates: ${err.message}`);
      await interaction.editReply(`⛔️ **ERROR:** ${err.message}`);
    }
  }
}
