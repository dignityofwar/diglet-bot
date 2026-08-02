import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GuildMember } from 'discord.js';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';
import { DiscordService } from '../../discord/discord.service';

export interface AlbionRankCountInterface {
  name: string;
  discordRoleId: string;
  priority: number;
  count: number;
}

export interface AlbionRankCountsInterface {
  ranks: AlbionRankCountInterface[];
  anyRank: number;
}

@Injectable()
export class AlbionRankCountsService {
  private readonly logger = new Logger(AlbionRankCountsService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
  ) {}

  async getRankCounts(guildId: string): Promise<AlbionRankCountsInterface> {
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');
    const guild = await this.discordService.getGuild(guildId);

    // Counting needs every member, not whatever the gateway happens to have cached
    const members = await guild.members.fetch();
    const humans = [...members.values()].filter((member: GuildMember) => !member.user?.bot);

    const ranks = [...roleMap]
      .sort((a, b) => a.priority - b.priority)
      .map((role) => ({
        name: role.name,
        discordRoleId: role.discordRoleId,
        priority: role.priority,
        count: humans.filter((member) => member.roles.cache.has(role.discordRoleId)).length,
      }));

    // Ranks overlap by design - the "keep" ranks stay on a member when they're promoted - so
    // summing the counts would double count people. This is the real headcount.
    const anyRank = humans.filter(
      (member) => roleMap.some((role) => member.roles.cache.has(role.discordRoleId)),
    ).length;

    this.logger.log(`Counted ${ranks.length} Albion rank roles across ${humans.length} members`);

    return { ranks, anyRank };
  }

  // A code block so the numbers can be copy-pasted straight into a spreadsheet or report
  formatReport(counts: AlbionRankCountsInterface): string {
    const nameWidth = Math.max(...counts.ranks.map((rank) => rank.name.length));
    const lines = counts.ranks.map(
      (rank) => `${rank.name.padEnd(nameWidth)}  ${String(rank.count).padStart(5)}`,
    );

    return `## 📊 Albion rank numbers
\`\`\`
${lines.join('\n')}
\`\`\`
Members holding **any** Albion rank: **${counts.anyRank}**
-# Counts are members currently holding each role, as Discord's role list shows them. Bots are excluded. Ranks overlap, so the individual counts don't add up to the total above.`;
  }
}
