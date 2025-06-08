import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Collection, Guild, Message, Role, Snowflake } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';

export interface RoleList {
  onboardedRole: Role
  communityGameRoles: Collection<Snowflake, Role>
  recGameRoles: Collection<Snowflake, Role>
}

@Injectable()
export class RecRolePingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecRolePingService.name);
  private recGameRoles: Collection<Snowflake, Role> = new Collection();

  constructor(
    private readonly discordService: DiscordService,
    private readonly configService: ConfigService
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log('Booting RecRolePingService...');
    let guild: Guild;

    try {
      guild = await this.discordService.getGuild(this.configService.get('discord.guildId'));
    }
    catch (err) {
      this.logger.error(`Failed to fetch guild: ${err.message}`);
      return;
    }

    await this.gatherRoles(guild);
  }

  async gatherRoles(guild: Guild): Promise<void> {
    this.logger.log('Gathering rec roles from guild...');

    // Force fetch all roles in the guild
    const roles = await guild.roles.fetch();
    if (!roles.size) {
      this.logger.error('No roles found in the guild');
      return;
    }

    // Find the rec game roles
    const recGameRoles = roles.filter(role =>
      role.name.toLowerCase().includes('rec/')
    );

    if (!recGameRoles.size) {
      this.logger.error('No rec game roles found in the guild!');
      return;
    }

    this.recGameRoles = recGameRoles;

    this.logger.log(`${recGameRoles.size} Rec roles loaded.`);
  }
}