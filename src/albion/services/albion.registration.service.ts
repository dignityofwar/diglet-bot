import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import {
  AlbionRegistrationsEntity,
} from '../../database/entities/albion.registrations.entity';
import { EntityRepository } from '@mikro-orm/core';
import { Channel, GuildMember, MessageFlags, TextChannel } from 'discord.js';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { AlbionApiService } from './albion.api.service';

export interface RegistrationData {
  discordMember: GuildMember,
  character: AlbionPlayerInterface,
  server: AlbionServer,
  serverName: string,
  serverEmoji: string,
  guildId: string;
  guildName: string;
  guildPingable: string;
}

@Injectable()
export class AlbionRegistrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRegistrationService.name);

  private verificationChannel: Channel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    private readonly albionApiService: AlbionApiService,
    @InjectRepository(AlbionRegistrationsEntity) private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
  ) {}

  async onApplicationBootstrap() {
    // Store the Discord guild channel and ensure we can send messages to it
    const verifyChannelId = this.config.get('discord.channels.albionRegistration');

    this.verificationChannel = await this.discordService.getChannel(verifyChannelId);
    if (!this.verificationChannel) {
      this.throwError(`Could not find channel with ID ${verifyChannelId}`);
    }
    if (!this.verificationChannel.isTextBased()) {
      this.throwError(`Channel with ID ${verifyChannelId} is not a text channel`);
    }

    // We purposefully don't check if the verified role exists, as the bot could technically belong to multiple servers, and we'd have to start injecting the guild ID into the config service, which is a bit of a pain.
  }

  // Gets all the required information to begin the process using as little inputs as possible.
  async getInfo(
    characterName: string,
    server: AlbionServer,
    discordMemberId: string,
    discordGuildId: string
  ): Promise<RegistrationData> {
    const serverName = server === AlbionServer.AMERICAS ? 'Americas' : 'Europe';

    return {
      discordMember: await this.discordService.getGuildMember(discordGuildId, discordMemberId),
      character: await this.albionApiService.getCharacter(characterName, server),
      server,
      serverName,
      serverEmoji: server === AlbionServer.AMERICAS ? '🇺🇸' : '🇪🇺',
      guildId: server === AlbionServer.AMERICAS ? this.config.get('albion.guildIdUS') : this.config.get('albion.guildIdEU'),
      guildName: server === AlbionServer.AMERICAS ? 'DIG - Dignity of War' : 'Dignity Of War',
      guildPingable: server === AlbionServer.AMERICAS ? '@ALB/US/Guildmaster' : '@ALB/EU/Archmage',
    };
  }

  async validate(data: RegistrationData): Promise<void> {
    this.logger.debug(`Checking if registration attempt for "${data.character.Name}" is valid`);

    // 1. Check if the roles to apply exist
    await this.checkRolesExist(data);

    // 2. Check if already registered
    // No try catch on purpose!
    await this.checkAlreadyRegistered(data);

    // 3. Check if the character is in the correct guild
    await this.checkIfInGuild(data);

    this.logger.debug(`Registration attempt for "${data.character.Name}" is valid!`);
  }

  // This is the actual registration process, handling the validation and registration of the character.
  // This is called from both the Registration Command (via the above proxy) and the Retry Service directly.
  // This function will throw an error, which will be caught by its caller, and displayed to the user there.
  async handleRegistration(
    characterName: string,
    server: AlbionServer,
    discordMemberId: string,
    discordGuildId: string,
    discordChannelId: string
  ) {
    // Any failures here will be caught then mention the user with the error.
    try {
      const data = await this.getInfo(characterName, server, discordMemberId, discordGuildId);
      const channel = await this.discordService.getChannel(discordChannelId) as TextChannel;

      this.logger.debug(`Handling Albion character "${data.character.Name}" registration for "${data.discordMember.displayName}" on server "${data.server}"`);

      await this.validate(data);

      // If we got here, we can safely register the character
      await this.registerCharacter(data, channel);
    }
    catch (err) {
      this.logger.error(`Registration failed for character "${characterName}"! Err: ${err.message}`);
      throw err;
    }
  }

  private throwError(error: string) {
    this.logger.error(error);
    throw new Error(error);
  }

  private async checkRolesExist(data: RegistrationData) {
    const rolesToCheck = [
      this.config.get('discord.roles.albionUSMember'),
      this.config.get('discord.roles.albionUSRegistered'),
      this.config.get('discord.roles.albionEURegistered'),
      this.config.get('discord.roles.albionUSAnnouncements'),
    ];

    try {
      for (const roleId of rolesToCheck) {
        await this.discordService.getMemberRole(data.discordMember, roleId);
      }
    }
    catch (err) {
      this.throwError(`Required Role(s) do not exist! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }
  }

  private async checkAlreadyRegistered(data: RegistrationData) {
    const foundMember = await this.albionRegistrationsRepository.findOne({
      characterId: data.character.Id,
      guildId: data.guildId,
    });

    if (!foundMember) {
      return;
    }

    // Get the original Discord user, if possible
    let originalDiscordMember: GuildMember;
    try {
      originalDiscordMember = await this.discordService.getGuildMember(
        data.discordMember.guild.id,
        foundMember.discordId
      );
    }
    catch (err) {
      this.logger.warn(`Unable to find original Discord user for character "${data.character.Name}"! Err: ${err.message}`);
    }

    const contactMessage = `If you believe this to be in error, please contact \`${data.guildPingable}\` in <#1039269706605002912>.`;

    // If the person who originally registered the character has left the server
    if (!originalDiscordMember) {
      this.throwError(`Sorry <@${data.discordMember.id}>, character **${data.character.Name}** has already been registered for the ${data.serverEmoji} ${data.guildName} Guild, but the user who registered it has left the server.\n\n${contactMessage}`);
    }

    // If the same discord user is trying to register another character, disallow it
    if (originalDiscordMember.id === data.discordMember.id) {
      this.throwError(`Sorry <@${data.discordMember.id}>, you have already registered a character named **${data.character.Name}** for the ${data.serverEmoji} ${data.guildName} Guild. We don't allow multiple character registrations to the same Discord user.\n\n${contactMessage}`);
    }

    // Otherwise it's already registered by someone else.
    this.throwError(`Sorry <@${data.discordMember.id}>, character **${data.character.Name}** has already been registered for the ${data.serverEmoji} ${data.guildName} Guild by Discord user **${originalDiscordMember.displayName}**.\n\n${contactMessage}`);
  }

  private async checkIfInGuild(data: RegistrationData) {
    // If in guild, good!
    if (data.character.GuildId === data.guildId) {
      return;
    }

    const subdomain = data.server === AlbionServer.AMERICAS ? 'gameinfo' : 'gameinfo-ams';
    const endpoint = `https://${subdomain}.albiononline.com/api/gameinfo/players/${data.character.Id}`;
    const characterInfo = {
      Id: data.character.Id,
      Name: data.character.Name,
      GuildId: data.character.GuildId ?? 'N/A',
      GuildName: data.character.GuildName ?? 'N/A',
      AllianceName: data.character.AllianceName ?? 'N/A',
      AllianceId: data.character.AllianceId ?? 'N/A',
    };

    this.throwError(`Sorry <@${data.discordMember.id}>, the character **${data.character.Name}** has not been detected in the ${data.serverEmoji} **${data.guildName}** Guild.
\n➡️**Please ensure you have spelt your character __exactly__ correct as it appears in-game**. If you have mis-spelt it, please run the command again with the correct spelling.
\n⏳We will automatically retry your registration attempt at the top of the hour over the next 24 hours. Sometimes our data source lags, so please be patient. **If you are not a member of DIG, this WILL fail regardless!!!**
\nIf _after_ 24 hours this has not worked, please contact \`${data.guildPingable}\` in <#1039269706605002912> for assistance.
\n||DEV DEBUG: [Gameinfo link](${endpoint}) \nCharacter JSON: \`${JSON.stringify(characterInfo)}\`||`);
  }

  private async registerCharacter(data: RegistrationData, channel: TextChannel) {
    // Add roles based on guild membership
    const memberRole = data.server === AlbionServer.AMERICAS ? this.config.get('discord.roles.albionUSMember') : this.config.get('discord.roles.albionEUMember');
    const registeredRole = data.server === AlbionServer.AMERICAS ? this.config.get('discord.roles.albionUSRegistered') : this.config.get('discord.roles.albionEURegistered');
    const announcementRole = data.server === AlbionServer.AMERICAS ? this.config.get('discord.roles.albionUSAnnouncements') : this.config.get('discord.roles.albionEUAnnouncements');

    try {
      await data.discordMember.roles.add(await this.discordService.getMemberRole(
        data.discordMember,
        memberRole
      ));
      await data.discordMember.roles.add(await this.discordService.getMemberRole(
        data.discordMember,
        registeredRole
      ));
      await data.discordMember.roles.add(await this.discordService.getMemberRole(
        data.discordMember,
        announcementRole
      ));
    }
    catch (err) {
      this.throwError(`Unable to add roles to "${data.discordMember.displayName}"! Pinging <@${this.config.get('discord.devUserId')}>!\nErr: ${err.message}`);
    }

    try {
      // Add the member to the database
      const entity = this.albionRegistrationsRepository.create({
        discordId: data.discordMember.id,
        characterId: data.character.Id,
        characterName: data.character.Name,
        guildId: data.guildId,
      });
      await this.albionRegistrationsRepository.upsert(entity);
    }
    catch (err) {
      this.throwError(`Unable to add you to the database! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }

    // Edit their nickname to match their ingame
    try {
      await data.discordMember?.setNickname(data.character.Name);
    }
    catch (err) {
      const errorMessage = `⚠️ Unable to set your nickname. If you're Staff this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}>!`;
      await channel.send(errorMessage);
      this.logger.error(errorMessage);
    }

    this.logger.log(`Registration for ${data.character.Name} was successful, returning success response.`);

    const rolesChannel = data.server === AlbionServer.AMERICAS ? this.config.get('discord.channels.albionUSRoles') : this.config.get('discord.channels.albionEURoles');
    const announcementChannel = data.server === AlbionServer.AMERICAS ? this.config.get('discord.channels.albionUSAnnouncements') : this.config.get('discord.channels.albionEUAnnouncements');

    const pingRoles = data.server === AlbionServer.AMERICAS ? this.config.get('albion.pingLeaderRolesUS') : this.config.get('albion.pingLeaderRolesEU');

    // Successful!
    const messageContent = `# ✅ Thank you <@${data.discordMember.id}>, your character **${data.character.Name}** has been registered! 🎉

## 👉️👉️👉️️ NEXT STEP: <#${rolesChannel}>
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${announcementChannel}> announcements channel. If you wish to opt out, go to <#${rolesChannel}>, double tap the 🔔 icon.

CC <@&${pingRoles.join('>, <@&')}>`;
    await channel.send({
      content: messageContent,
      flags: MessageFlags.SuppressEmbeds,
    });
  }
}
