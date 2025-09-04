import { AlbionRoleMapInterface } from "../../config/albion.app.config";
import { GuildMember } from "discord.js";
import { ConfigService } from "@nestjs/config";
import { Injectable } from "@nestjs/common";

@Injectable()
export class AlbionUtilities {
  constructor(private readonly config: ConfigService) {}

  getHighestAlbionRole(
    discordMember: GuildMember,
  ): AlbionRoleMapInterface | null {
    const roleMap: AlbionRoleMapInterface[] = this.config.get("albion.roleMap");

    let highestPriorityRole: AlbionRoleMapInterface | null = null;

    roleMap.forEach((role) => {
      const hasRole = discordMember.roles.cache.has(role.discordRoleId);

      if (!hasRole) return;

      if (
        !highestPriorityRole ||
        role.priority < highestPriorityRole.priority
      ) {
        highestPriorityRole = role;
      }
    });

    return highestPriorityRole;
  }
}
