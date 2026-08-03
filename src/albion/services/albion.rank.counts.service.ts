import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, Role } from 'discord.js';
import { AlbionRoleMapInterface } from '../../config/albion.app.config';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { DiscordService } from '../../discord/discord.service';

export interface AlbionRoleCountInterface {
  name: string;
  discordRoleId: string;
  count: number;
}

export interface AlbionRankCountsInterface {
  ranks: AlbionRoleCountInterface[];
  content: AlbionRoleCountInterface[];
  anyRank: number;
  registered: number;
}

// Discord's hard cap on a single message
const MESSAGE_LIMIT = 2000;

@Injectable()
export class AlbionRankCountsService {
  private readonly logger = new Logger(AlbionRankCountsService.name);

  // Content roles aren't configured anywhere - they're added and retired in the Discord UI as
  // the guild's interests change - so they're found by name instead. Rank roles share the
  // prefix and are excluded by ID.
  private readonly albionRolePrefix = 'ALB/';

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    @InjectRepository(AlbionRegistrationsEntity) private readonly registrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
  ) {}

  async getRankCounts(guildId: string): Promise<AlbionRankCountsInterface> {
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');
    const guild = await this.discordService.getGuild(guildId);

    // Roles first: a member's role cache is derived from the guild's role cache, and fetching
    // roles busts that cache, so counting before this point would come back empty.
    const roles = await this.discordService.getAllRolesFromGuild(guild);

    // Counting needs every member, not whatever the gateway happens to have cached
    const members = await guild.members.fetch();
    const humans = [...members.values()].filter((member: GuildMember) => !member.user?.bot);

    // Content roles are self-assigned from a reaction role message, so anyone in the server can
    // pick one up. Cross-referencing the registrations makes the content numbers guild members
    // only, rather than a headcount of everyone who ever clicked an emoji.
    const registrations = await this.registrationsRepository.find({
      guildId: this.config.get('albion.guildId'),
    });
    const registeredDiscordIds = new Set(registrations.map((registration) => registration.discordId));

    const countHolders = (roleId: string) => humans.filter((member) => member.roles.cache.has(roleId)).length;
    const countRegisteredHolders = (roleId: string) => humans.filter(
      (member) => member.roles.cache.has(roleId) && registeredDiscordIds.has(member.id),
    ).length;

    const ranks = [...roleMap]
      .sort((a, b) => a.priority - b.priority)
      .map((role) => ({
        name: role.name,
        discordRoleId: role.discordRoleId,
        count: countHolders(role.discordRoleId),
      }));

    const rankRoleIds = new Set(roleMap.map((role) => role.discordRoleId));
    const content = [...(roles?.values() ?? [])]
      .filter((role: Role) => this.isContentRole(role, rankRoleIds))
      .map((role: Role) => ({
        name: role.name,
        discordRoleId: role.id,
        count: countRegisteredHolders(role.id),
      }))
      // Most popular content first, since that's the point of the numbers
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    // Ranks overlap by design - the "keep" ranks stay on a member when they're promoted - so
    // summing the counts would double count people. This is the real headcount.
    const anyRank = humans.filter(
      (member) => roleMap.some((role) => member.roles.cache.has(role.discordRoleId)),
    ).length;

    // The denominator for the content numbers: registrations belonging to someone still here
    const registered = humans.filter((member) => registeredDiscordIds.has(member.id)).length;

    this.logger.log(`Counted ${ranks.length} Albion rank roles and ${content.length} content roles across ${humans.length} members`);

    return { ranks, content, anyRank, registered };
  }

  private isContentRole(role: Role, rankRoleIds: Set<string>): boolean {
    if (rankRoleIds.has(role.id)) {
      return false;
    }

    // Role names are stored with the mention '@' in config but not on Discord, so tolerate both
    return this.stripMention(role.name).startsWith(this.albionRolePrefix);
  }

  private stripMention(name: string): string {
    return name.startsWith('@') ? name.slice(1) : name;
  }

  // Code blocks so the numbers can be copy-pasted straight into a spreadsheet or report
  formatReport(counts: AlbionRankCountsInterface): string {
    const contentSection = counts.content.length > 0
      ? `\`\`\`\n${this.formatTable(counts.content)}\n\`\`\``
      : '_No ALB content roles found._';

    return `## 📊 Albion role numbers
### Ranks
\`\`\`
${this.formatTable(counts.ranks)}
\`\`\`
Members holding **any** Albion rank: **${counts.anyRank}**
### Content roles
${contentSection}
Registered members in the server: **${counts.registered}**
-# Rank counts are members currently holding each role, as Discord's role list shows them. Content counts only include members who are **also** registered with the guild, so self-assigned roles picked up by non-members aren't counted. Bots are excluded throughout. Roles overlap, so the individual counts don't add up to the totals.`;
  }

  private formatTable(roles: AlbionRoleCountInterface[]): string {
    const nameWidth = Math.max(...roles.map((role) => role.name.length));

    return roles
      .map((role) => `${role.name.padEnd(nameWidth)}  ${String(role.count).padStart(5)}`)
      .join('\n');
  }

  // The guild can add content roles indefinitely, so the report can outgrow a single message
  chunkReport(report: string): string[] {
    if (report.length <= MESSAGE_LIMIT) {
      return [report];
    }

    const chunks: string[] = [];
    let chunk = '';

    for (const line of report.split('\n')) {
      // +1 for the newline that rejoins it
      if (chunk.length + line.length + 1 > MESSAGE_LIMIT) {
        chunks.push(chunk);
        chunk = '';
      }

      chunk += chunk.length > 0 ? `\n${line}` : line;
    }

    if (chunk.length > 0) {
      chunks.push(chunk);
    }

    return chunks;
  }
}
