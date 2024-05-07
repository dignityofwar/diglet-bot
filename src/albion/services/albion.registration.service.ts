import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { EntityRepository } from '@mikro-orm/core';
import { Channel, GuildMember, Message, MessageFlags } from 'discord.js';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { AlbionApiService } from './albion.api.service';

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

  async validateRegistrationAttempt(dto: AlbionRegisterDto, character: AlbionPlayerInterface, guildMember: GuildMember): Promise<string | true> {
    this.logger.debug(`Checking if registration attempt for "${character.Name}" is valid`);

    // 1. Check if the roles to apply exist
    try {
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionUSMember'));
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionUSRegistered'));
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionEURegistered'));
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionUSAnnouncements'));
    }
    catch (err) {
      this.throwError(`Required Role(s) do not exist! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }

    // 2. Check if the user is in the guild
    const guildId = dto.server === AlbionServer.AMERICAS ? this.config.get('albion.guildIdUS') : this.config.get('albion.guildIdEU');

    // Fragments
    const serverName = dto.server === AlbionServer.AMERICAS ? '🇺🇸 Americas' : '🇪🇺 Europe';
    const guildName = dto.server === AlbionServer.AMERICAS ? 'DIG - Dignity of War' : 'Dignity Of War';
    const rankName = dto.server === AlbionServer.AMERICAS ? '@ALB/US/Guildmaster' : '@ALB/EU/Archmage';

    if (character.GuildId !== guildId) {
      this.throwError(`Sorry <@${guildMember.id}>, the character **${character.Name}** has not been detected in the DIG ${serverName} Guild. Please ensure that:\n
1. You have spelt the name **exactly** correct (case sensitive).
2. You are a member of the Guild "**${guildName}**".
3. You have waited ~10 minutes before trying again (sometimes our data source is slow).
4. You have waited 1 hour before trying again.
\nIf you are still having issues, please contact \`${rankName}\` in <#1039269706605002912>.`);
    }

    // 3. Check if the character has already been registered on the same server
    const foundMember = await this.albionRegistrationsRepository.find({ characterId: character.Id, guildId });

    if (foundMember.length > 0) {
      // Get the original Discord user, if possible
      let originalDiscordMember: GuildMember;
      try {
        originalDiscordMember = await this.discordService.getGuildMember(guildMember.guild.id, foundMember[0].discordId);
      }
      catch (err) {
        this.logger.warn(`Unable to find original Discord user for character "${character.Name}"! Err: ${err.message}`);
      }

      if (!originalDiscordMember) {
        this.throwError(`Sorry <@${guildMember.id}>, character **${character.Name}** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the Albion Guild Masters in <#1039269706605002912>.`);
      }

      this.throwError(`Sorry <@${guildMember.id}>, character **${character.Name}** has already been registered by Discord user \`@${originalDiscordMember.displayName}\`. If this is you, you don't need to do anything. If you believe this to be in error, please contact the Albion Guild Masters in <#1039269706605002912>.`);
    }

    // 4. Check if the user has already registered a character
    const discordMember = await this.albionRegistrationsRepository.find({ discordId: guildMember.id, guildId });
    if (discordMember.length > 0) {
      const serverName = dto.server === AlbionServer.AMERICAS ? 'Americas' : 'Europe';
      const leaderName = dto.server === AlbionServer.AMERICAS ? 'Guild Masters' : 'Archmages';
      this.throwError(`Sorry <@${guildMember.id}>, you have already registered a character named **${discordMember[0].characterName}** for the ${serverName} Guild. We don't allow multiple Guild characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or if you have registered the wrong character, please contact the Albion ${leaderName} in <#1039269706605002912>.`);
    }

    this.logger.debug(`Registration attempt for "${character.Name}" is valid`);

    return true;
  }

  async registrationMessageProxy(dto: AlbionRegisterDto, discordMember: GuildMember, message: Message,) {
    try {
      await this.handleRegistration(dto, discordMember, message);
    }
    catch (err) {
      await message.edit(`⛔️ **ERROR:** ${err.message}`);
      this.logger.error(err.message);
    }
  }

  async handleRegistration(dto: AlbionRegisterDto, discordMember: GuildMember, message: Message) {
    this.logger.debug(`Handling Albion character "${dto.character}" registration for "${discordMember.displayName}" on server "${dto.server}"`);

    if (!dto.server) {
      this.throwError(`Server was not specified, this shouldn't be possible. Pinging <@${this.config.get('discord.devUserId')}>!`);
    }

    const guildId = dto.server === AlbionServer.AMERICAS ? this.config.get('albion.guildIdUS') : this.config.get('albion.guildIdEU');

    let character: AlbionPlayerInterface;
    try {
      // Get the character from the Albion Online API
      character = await this.albionApiService.getCharacter(dto.character, dto.server);
    }
    catch (err) {
      // Append "Sorry <person>, " to the error message
      this.throwError(`Sorry <@${discordMember.id}>, ${err.message}`);
    }

    await this.validateRegistrationAttempt(dto, character, discordMember);

    // Add roles based on guild membership
    const memberRole = dto.server === AlbionServer.AMERICAS ? this.config.get('discord.roles.albionUSMember') : this.config.get('discord.roles.albionEUMember');
    const registeredRole = dto.server === AlbionServer.AMERICAS ? this.config.get('discord.roles.albionUSRegistered') : this.config.get('discord.roles.albionEURegistered');
    const announcementRole = dto.server === AlbionServer.AMERICAS ? this.config.get('discord.roles.albionUSAnnouncements') : this.config.get('discord.roles.albionEUAnnouncements');

    try {
      await discordMember.roles.add(await this.discordService.getMemberRole(
        discordMember,
        memberRole
      ));
      await discordMember.roles.add(await this.discordService.getMemberRole(
        discordMember,
        registeredRole
      ));
      await discordMember.roles.add(await this.discordService.getMemberRole(
        discordMember,
        announcementRole
      ));
    }
    catch (err) {
      this.throwError(`Unable to add roles to "${discordMember.displayName}"! Pinging <@${this.config.get('discord.devUserId')}>!\nErr: ${err.message}`);
    }

    try {
      // Add the member to the database
      const entity = this.albionRegistrationsRepository.create({
        discordId: discordMember.id,
        characterId: character.Id,
        characterName: character.Name,
        guildId,
      });
      await this.albionRegistrationsRepository.upsert(entity);
    }
    catch (err) {
      this.throwError(`Unable to add you to the database! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }

    // Edit their nickname to match their ingame
    try {
      await discordMember?.setNickname(character.Name);
    }
    catch (err) {
      const errorMessage = `⚠️ Unable to set your nickname. If you're Staff this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}>!`;
      await message.channel.send(errorMessage);
      this.logger.error(errorMessage);
    }

    this.logger.log(`Registration for ${character.Name} was successful, returning success response.`);

    const rolesChannel = dto.server === AlbionServer.AMERICAS ? this.config.get('discord.channels.albionUSRoles') : this.config.get('discord.channels.albionEURoles');
    const announcementChannel = dto.server === AlbionServer.AMERICAS ? this.config.get('discord.channels.albionUSAnnouncements') : this.config.get('discord.channels.albionEUAnnouncements');

    const scanPingRoles = dto.server === AlbionServer.AMERICAS ? this.config.get('albion.pingLeaderRolesUS') : this.config.get('albion.pingLeaderRolesEU');

    // Successful!
    const messageContent = `# ✅ Thank you <@${discordMember.id}>, your character **${character.Name}** has been registered! 🎉

## 👉️👉️👉️️ NEXT STEP: <#${rolesChannel}>
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${announcementChannel}> announcements channel. If you wish to opt out, go to <#${rolesChannel}>, double tap the 🔔 icon.

CC <@&${scanPingRoles.join('>, <@&')}>`;
    await message.channel.send({
      content: messageContent,
      flags: MessageFlags.SuppressEmbeds,
    });

    // Delete the placeholder message
    await message.delete();
  }

  private throwError(error: string) {
    this.logger.error(error);
    throw new Error(error);
  }
}
