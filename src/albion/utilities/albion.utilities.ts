import { AlbionRoleMapInterface } from '../../config/albion.app.config';
import { Guild, GuildMember } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';

@Injectable()
export class AlbionUtilities {
  constructor(
    private readonly config: ConfigService,
  ) {}

  getHighestAlbionRole(
    discordMember: GuildMember,
  ): AlbionRoleMapInterface | null {
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');

    let highestPriorityRole: AlbionRoleMapInterface | null = null;

    roleMap.forEach((role) => {
      const hasRole = discordMember.roles.cache.has(role.discordRoleId);

      if (!hasRole) {
        return;
      }

      if (!highestPriorityRole || role.priority < highestPriorityRole.priority) {
        highestPriorityRole = role;
      }
    });

    return highestPriorityRole;
  }

  // Everyone entitled to vote on a rank up: Eldritch Mage and above. The same set decides the
  // displayed count, the pass threshold and whose reactions score, so it lives in one place.
  isElector(discordMember: GuildMember): boolean {
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');
    const maxPriority: number = this.config.get('albion.electorMaxPriority');

    return roleMap.some(
      (role) => role.priority <= maxPriority && discordMember.roles.cache.has(role.discordRoleId),
    );
  }

  async getElectors(guild: Guild): Promise<GuildMember[]> {
    // Counting needs the full member list, not whatever happens to be cached
    await guild.members.fetch();

    return [...guild.members.cache.values()].filter(
      (member) => !member.user.bot && this.isElector(member),
    );
  }
}
