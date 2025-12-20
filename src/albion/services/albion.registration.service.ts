import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { EntityRepository } from '@mikro-orm/core';
import { Channel, GuildMember, MessageFlags, TextChannel } from 'discord.js';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { AlbionApiService } from './albion.api.service';
import {
  AlbionRegistrationQueueEntity,
  AlbionRegistrationQueueStatus,
} from '../../database/entities/albion.registration.queue.entity';

export interface RegistrationData {
  discordMember: GuildMember
  character: AlbionPlayerInterface
  server: AlbionServer
  serverName: string
  serverEmoji: string
  guildId: string
  guildName: string
  guildPingable: string
}

@Injectable()
export class AlbionRegistrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRegistrationService.name);

  private verificationChannel: Channel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    private readonly albionApiService: AlbionApiService,
    @InjectRepository(AlbionRegistrationsEntity)
    private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
    @InjectRepository(AlbionRegistrationQueueEntity)
    private readonly albionRegistrationQueueRepository: EntityRepository<AlbionRegistrationQueueEntity>,
  ) {}

  async onApplicationBootstrap() {
    // Store the Discord guild channel and ensure we can send messages to it
    const verifyChannelId = this.config.get('discord.channels.albionRegistration');

    this.verificationChannel = await this.discordService.getTextChannel(verifyChannelId);
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
    discordGuildId: string,
  ): Promise<RegistrationData> {
    return {
      discordMember: await this.discordService.getGuildMember(discordGuildId, discordMemberId),
      character: await this.albionApiService.getCharacter(characterName, server),
      server,
      serverName: 'Europe',
      serverEmoji: '🇪🇺',
      guildId: this.config.get('albion.guildId'),
      guildName: 'Dignity Of War',
      guildPingable: '@ALB/Archmage',
    };
  }

  async validate(
    data: RegistrationData,
    registrationContext?: { discordChannelId: string; discordGuildId: string },
  ): Promise<void> {
    this.logger.debug(`Checking if registration attempt for "${data.character.Name}" is valid`);

    // 1. Check if the roles to apply exist
    await this.checkRolesExist(data);

    // 2. Check if already registered
    // No try catch on purpose!
    await this.checkAlreadyRegistered(data);

    // 3. Check if the character is in the correct guild
    await this.checkIfInGuild(data, registrationContext);

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
    discordChannelId: string,
  ) {
    let channel: TextChannel;
    try {
      channel = await this.discordService.getTextChannel(discordChannelId);
    }
    catch (err) {
      const errorMessage = `Failed to get channel with ID ${discordChannelId}! Err: ${err.message}. Pinging <@${this.config.get('discord.devUserId')}>!`;
      this.throwError(errorMessage);
    }

    // Any failures here will be caught then mention the user with the error.
    try {
      const data = await this.getInfo(characterName, server, discordMemberId, discordGuildId);

      this.logger.debug(
        `Handling Albion character "${data.character.Name}" registration for "${data.discordMember.displayName}" on server "${data.server}"`,
      );

      await this.validate(data, { discordChannelId, discordGuildId });

      // If we got here, we can safely register the character
      await this.registerCharacter(data, channel);

      // If queued previously, mark as succeeded so it doesn't keep retrying
      try {
        const queued = await this.albionRegistrationQueueRepository.findOne({
          guildId: data.guildId,
          discordId: discordMemberId,
        });
        if (queued) {
          queued.status = AlbionRegistrationQueueStatus.SUCCEEDED;
          queued.lastError = null;
          await this.albionRegistrationQueueRepository.getEntityManager().flush();
        }
      }
      catch (err) {
        this.logger.warn(
          `Unable to update queued registration status for ${discordMemberId}: ${err.message}`,
        );
      }
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
      this.config.get('discord.roles.albionMember'),
      this.config.get('discord.roles.albionRegistered'),
      this.config.get('discord.roles.albionAnnouncements'),
    ];

    try {
      for (const roleId of rolesToCheck) {
        await this.discordService.getRoleViaMember(data.discordMember, roleId);
      }
    }
    catch (err) {
      this.throwError(
        `Required Role(s) do not exist! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`,
      );
    }
  }

  private async checkAlreadyRegistered(data: RegistrationData) {
    const contactMessage = `If you believe this to be in error, please contact \`${data.guildPingable}\` in <#1039269706605002912>.`;

    const foundByCharacter = await this.albionRegistrationsRepository.findOne({
      characterId: data.character.Id,
      guildId: data.guildId,
    });

    const foundByDiscord = await this.albionRegistrationsRepository.findOne({
      guildId: data.guildId,
      discordId: String(data.discordMember.user.id),
    });

    // No previous registrations found
    if (!foundByCharacter && !foundByDiscord) {
      return;
    }

    if (foundByDiscord?.discordId) {
      this.throwError(
        `Sorry <@${data.discordMember.id}>, you have already registered a character named **${foundByDiscord.characterName}** for the ${data.serverEmoji} ${data.guildName} Guild. We don't allow multiple character registrations to the same Discord user.\n\n${contactMessage}`,
      );
    }

    // Get the original Discord user, if possible
    let originalDiscordMember: GuildMember;
    try {
      originalDiscordMember = await this.discordService.getGuildMember(
        data.discordMember.guild.id,
        foundByCharacter.discordId,
      );
    }
    catch (err) {
      this.logger.warn(
        `Unable to find original Discord user for character "${data.character.Name}"! Err: ${err.message}`,
      );
    }

    // If the person who originally registered the character has left the server
    if (!originalDiscordMember?.user?.id) {
      this.throwError(
        `Sorry <@${data.discordMember.id}>, character **${data.character.Name}** has already been registered for the ${data.serverEmoji} ${data.guildName} Guild, but the user who registered it has left the server.\n\n${contactMessage}`,
      );
    }
    this.throwError(
      `Sorry <@${data.discordMember.id}>, character **${data.character.Name}** has already been registered for the ${data.serverEmoji} ${data.guildName} Guild by Discord user \`@${originalDiscordMember.displayName}\`.\n\n${contactMessage}`,
    );
  }

  private async checkIfInGuild(
    data: RegistrationData,
    registrationContext?: { discordChannelId: string; discordGuildId: string },
  ) {
    // If in guild, good!
    if (data.character.GuildId === data.guildId) {
      return;
    }

    // If we don't have context (shouldn't happen), fall back to old behavior.
    if (!registrationContext?.discordChannelId || !registrationContext?.discordGuildId) {
      this.throwError(
        `Sorry <@${data.discordMember.id}>, the character **${data.character.Name}** has not been detected in the ${data.serverEmoji} **${data.guildName}** Guild.\n\n- ➡️ **Please ensure you have spelt your character __exactly__ correct as it appears in-game**. It is case sensitive.\n- ⏳ **Play the game for about an hour, then try again.**`,
      );
    }

    // Enqueue (or refresh) a retryable attempt.
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + 72);

    try {
      const existing = await this.albionRegistrationQueueRepository.findOne({
        guildId: data.guildId,
        discordId: String(data.discordMember.user.id),
      });

      if (existing) {
        existing.characterName = data.character.Name;
        existing.server = data.server;
        existing.discordChannelId = registrationContext.discordChannelId;
        existing.discordGuildId = registrationContext.discordGuildId;
        existing.status = AlbionRegistrationQueueStatus.PENDING;
        existing.expiresAt = expiresAt;
        existing.lastError = 'Character not detected in guild yet.';
        await this.albionRegistrationQueueRepository.getEntityManager().flush();
      }
      else {
        const entity = this.albionRegistrationQueueRepository.create({
          guildId: data.guildId,
          discordGuildId: registrationContext.discordGuildId,
          discordChannelId: registrationContext.discordChannelId,
          discordId: String(data.discordMember.user.id),
          characterName: data.character.Name,
          server: data.server,
          attemptCount: 0,
          expiresAt,
          status: AlbionRegistrationQueueStatus.PENDING,
          lastError: 'Character not detected in guild yet.',
        });
        await this.albionRegistrationQueueRepository.upsert(entity);
      }

      // Notify the user in the channel where they invoked the command.
      try {
        const channel = await this.discordService.getTextChannel(registrationContext.discordChannelId);
        if (channel?.isTextBased()) {
          await channel.send(
            `<@${data.discordMember.id}> your registration is now in a queue, and it will be re-attempted every hour for the next 72 hours. The game database we have access to lags behind quite often. You will be notified that your registration is successful (if not, you'll be told so you can try again).`,
          );
        }
      }
      catch (err) {
        this.logger.warn(
          `Failed to send queued-registration notice for ${data.discordMember.id}: ${err.message}`,
        );
      }
    }
    catch (err) {
      this.logger.error(
        `Failed to enqueue Albion registration retry for ${data.discordMember.id}: ${err.message}`,
      );
      // If we can't enqueue, don't hide the original error.
    }

    this.throwError(
      `Sorry <@${data.discordMember.id}>, the character **${data.character.Name}** has not been detected in the ${data.serverEmoji} **${data.guildName}** Guild.\n\n- ➡️ **Please ensure you have spelt your character __exactly__ correct as it appears in-game**. If you have mis-spelt it, please run the command again with the correct spelling.\n- ⏳ We will automatically retry your registration attempt once per hour over the next 72 hours. Sometimes our data source lags, so please be patient. **If you are not a member of DIG, this WILL fail regardless.**\n\nIf _after_ 72 hours this has not worked, we will ping you and \`${data.guildPingable}\` to re-attempt or assist.`,
    );
  }

  private async registerCharacter(data: RegistrationData, channel: TextChannel) {
    // Add roles based on guild membership
    const memberRole = this.config.get('discord.roles.albionMember');
    const registeredRole = this.config.get('discord.roles.albionRegistered');
    const announcementRole = this.config.get('discord.roles.albionAnnouncements');

    try {
      await data.discordMember.roles.add(
        await this.discordService.getRoleViaMember(data.discordMember, memberRole),
      );
      await data.discordMember.roles.add(
        await this.discordService.getRoleViaMember(data.discordMember, registeredRole),
      );
      await data.discordMember.roles.add(
        await this.discordService.getRoleViaMember(data.discordMember, announcementRole),
      );
    }
    catch (err) {
      this.throwError(
        `Unable to add roles to "${data.discordMember.displayName}"! Pinging <@${this.config.get('discord.devUserId')}>!\nErr: ${err.message}`,
      );
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
      this.throwError(
        `Unable to add you to the database! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`,
      );
    }

    // Edit their nickname to match their ingame
    try {
      await data.discordMember?.setNickname(data.character.Name);
    }
    catch (err) {
      const errorMessage = `⚠️ Unable to set your nickname. If you're Staff this won't work as the bot has no power over you!\nError: "${err.message}".\nPinging <@${this.config.get('discord.devUserId')}>!`;
      await channel.send(errorMessage);
      this.logger.error(errorMessage);
    }

    this.logger.log(
      `Registration for ${data.character.Name} was successful, returning success response.`,
    );

    const rolesChannel = this.config.get('discord.channels.albionRoles');
    const announcementChannel = this.config.get('discord.channels.albionAnnouncements');
    const pingRoles = this.config.get('albion.pingLeaderRoles');

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
