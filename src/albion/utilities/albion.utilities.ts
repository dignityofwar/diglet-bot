import { AlbionRoleMapInterface } from '../../config/albion.app.config';
import { GuildMember } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { Injectable } from '@nestjs/common';
import { AlbionServer } from '../interfaces/albion.api.interfaces';

@Injectable()
export class AlbionUtilities {
  constructor(
    private readonly config: ConfigService,
  ) {}

  getHighestAlbionRole(
    discordMember: GuildMember,
    server: AlbionServer = AlbionServer.AMERICAS
  ): AlbionRoleMapInterface | null {
    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');

    let highestPriorityRole: AlbionRoleMapInterface | null = null;

    roleMap.forEach((role) => {
      const hasRole = discordMember.roles.cache.has(role.discordRoleId);

      if (!hasRole) return;

      // If the role is not for the server we're looking for, skip it
      if (role.server !== server) return;

      if (!highestPriorityRole || role.priority < highestPriorityRole.priority) {
        highestPriorityRole = role;
      }
    });

    return highestPriorityRole;
  }
}
