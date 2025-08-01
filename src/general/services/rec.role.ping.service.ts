import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Guild, Message, Snowflake } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';

@Injectable()
export class RecRolePingService implements OnApplicationBootstrap {
  private readonly logger = new Logger(RecRolePingService.name);
  private recGameRoleIds: Snowflake[];
  private guild: Guild;

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

    this.guild = guild;

    this.recGameRoleIds = await this.gatherRoles(guild);
  }

  async gatherRoles(guild: Guild): Promise<string[] | undefined> {
    this.logger.log('Gathering rec roles from guild...');

    // Force fetch all roles in the guild
    const roles = await guild.roles.fetch();
    if (!roles.size) {
      this.logger.error('No roles found in the guild');
      return;
    }

    // Find the rec game roles, exclude any roles that start with Rec/PS2/
    const recGameRoles = roles.filter(role => {
      // Convert to lowercase
      const roleName = role.name.toLowerCase();

      return roleName.startsWith('rec/') && !roleName.startsWith('rec/ps2/');
    });

    if (!recGameRoles.size) {
      this.logger.error('No rec game roles found in the guild!');
      return;
    }

    // Echo the rec roles loaded to the log
    this.logger.log(`Rec game roles loaded: ${recGameRoles.map(role => `"${role.name}"`).join(', ')}`);

    // Convert the roles to a list of role IDs
    // We need to into each role and pull out the ID
    return Array.from(recGameRoles.values()).map(role => role.id);

  }

  @Cron('0 * * * *') // Top of every hour
  async gatherRolesCron(): Promise<void> {
    if (!this.guild) {
      this.logger.error('Guild not set. Cannot gather roles via cron.');
      return;
    }

    this.logger.log('Gathering rec roles from guild via cron...');

    this.recGameRoleIds = await this.gatherRoles(this.guild);
  }

  async onMessage(message: Message): Promise<void> {
    if (!this?.recGameRoleIds.length) {
      this.logger.error('No rec game roles loaded, skipping message processing.');
      return;
    }

    // Scan the content of the message to see if it contains any of the rec game role IDs.
    // The message will be in the format of "Hello <@&ROLEID>!"
    const roleMentions = message.mentions.roles;

    // If there were no role mentions, we're done.
    if (!roleMentions || roleMentions.size === 0) {
      return;
    }

    // Check if any of the mentioned roles are rec game roles
    const mentionedRecRoles = roleMentions.filter(role => this.recGameRoleIds.includes(role.id));

    // If there are no mentioned rec roles, we're done.
    if (mentionedRecRoles.size === 0) {
      return;
    }

    // Log the message content and the mentioned rec roles
    this.logger.log(`Message from ${message.member.id} mentions rec roles: ${mentionedRecRoles.map(role => role.name).join(', ')}`);

    // Send a message to the channel it came from
    const content = 'If you just got pinged, remember our Rec Game pings are opt in. You can opt out here: https://discord.com/channels/90078410642034688/1170026809807622229/1208438379126071296.';

    try {
      const channel = await this.discordService.getTextChannel(message.channel.id);
      await channel.send(content);
      this.logger.log(`Sent reminder message to ${message.channel.id}`);
    }
    catch (err) {
      this.logger.error(`Failed to send reminder message: ${err.message}`);
    }
  }
}