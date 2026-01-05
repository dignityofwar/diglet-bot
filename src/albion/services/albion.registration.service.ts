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

type RegistrationOptions = {
  queueValidation?: boolean
}

@Injectable()
export class AlbionRegistrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRegistrationService.name);

  private verificationChannel: Channel;

  // Track configured IDs so we don't have to thread registrationContext through the call chain.
  private verificationChannelId: string;

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
    this.verificationChannelId = String(verifyChannelId);

    this.verificationChannel = await this.discordService.getTextChannel(verifyChannelId);
    if (!this.verificationChannel) {
      this.throwError(`Could not find channel with ID ${verifyChannelId}`);
    }
    if (!this.verificationChannel.isTextBased()) {
      this.throwError(`Channel with ID ${verifyChannelId} is not a text channel`);
    }

    // We purposefully don't check if the verified role exists, as the bot could technically belong to multiple servers, and we'd have to start injecting the guild ID into the config service, which is a bit of a pain.
  }

  async validate(data: RegistrationData, options?: RegistrationOptions): Promise<void> {
    this.logger.debug(`Checking if registration attempt for "${data.character.Name}" is valid`);

    // 1. Check if the roles to apply exist
    await this.checkRolesExist(data);

    // 2. Check if already registered
    // No try catch on purpose!
    await this.checkAlreadyRegistered(data);

    // When processing queued attempts (retry cron), we intentionally skip the queue-related checks.
    if (options?.queueValidation !== false) {
      // 3. Prevent other users from attempting to register a character that someone else has already queued.
      await this.checkCharacterQueueOwnership(data);

      // 4. If an attempt already exists for this Discord user and they changed the character name,
      // re-queue their existing attempt and exit early with a message.
      await this.requeueChangedCharacterName(data);

      // 5. Check if there is already a queued attempt
      await this.checkForQueueAttempt(data);
    }

    // 6. Check if the character is in the correct guild
    await this.checkIfInGuild(data);

    this.logger.debug(`Registration attempt for "${data.character.Name}" is valid!`);
  }

  private async checkCharacterQueueOwnership(data: RegistrationData): Promise<void> {
    const existing = await this.albionRegistrationQueueRepository.findOne({
      guildId: data.guildId,
      characterName: data.character.Name,
      status: AlbionRegistrationQueueStatus.PENDING,
    });

    if (!existing) {
      return;
    }

    // Same user re-attempting is allowed; everything else is suspicious.
    if (String(existing.discordId) === String(data.discordMember.user.id)) {
      return;
    }

    const devUserId = this.config.get('discord.devUserId');

    this.throwError(
      `You are not allowed to attempt to register another person's character. Reporting this to <@${devUserId}>!`,
    );
  }

  private async requeueChangedCharacterName(data: RegistrationData): Promise<void> {
    const existing = await this.albionRegistrationQueueRepository.findOne({
      guildId: data.guildId,
      discordId: String(data.discordMember.user.id),
      status: AlbionRegistrationQueueStatus.PENDING,
    });

    if (!existing) {
      return;
    }

    // Same character name means the user is just spamming the command - leave it to checkForQueueAttempt.
    if (existing.characterName === data.character.Name) {
      return;
    }

    // User retried with a different character name: update the existing attempt and tell them.
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + 72);

    const previousName = existing.characterName;

    existing.characterName = data.character.Name;
    existing.server = data.server;
    existing.discordGuildId = data.discordMember.guild.id;
    existing.discordChannelId = this.verificationChannelId;
    existing.attemptCount = 0;
    existing.lastError = 'Character name updated by user.';
    existing.expiresAt = expiresAt;

    await this.albionRegistrationQueueRepository.getEntityManager().flush();

    const expiresDiscordTime = `<t:${Math.floor(expiresAt.getTime() / 1000)}:f>`;

    this.throwError(
      `<@${data.discordMember.id}> I've updated your queued registration attempt from **${previousName}** to **${data.character.Name}**.\n\n## ⏳ We will automatically retry your registration attempt hourly until ${expiresDiscordTime}.`,
    );
  }

  private async checkForQueueAttempt(data: RegistrationData): Promise<void> {
    const existing = await this.albionRegistrationQueueRepository.findOne({
      guildId: data.guildId,
      characterName: data.character.Name,
      status: AlbionRegistrationQueueStatus.PENDING,
    });

    // If already queued for this character (and implicitly this user), inform the user and exit early.
    if (existing) {
      const expiresDiscordTime = `<t:${Math.floor(existing.expiresAt.getTime() / 1000)}:f>`;

      this.throwError(
        `<@${data.discordMember.id}> your registration attempt is **already queued**. Your request will be retried hourly until ${expiresDiscordTime}. Re-attempting registration is pointless at this time. Please be patient.`,
      );
    }
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
    options?: RegistrationOptions,
  ) {
    let channel: TextChannel;
    try {
      channel = await this.discordService.getTextChannel(discordChannelId);
    }
    catch (err) {
      const errorMessage = `Failed to get channel with ID ${discordChannelId}! Err: ${err.message}. Pinging <@${this.config.get('discord.devUserId')}>!`;
      this.throwError(errorMessage);
    }

    // If queueValidation is not explicitly disabled, make sure it's set
    if (!options) {
      options = { queueValidation: true };
    }
    else if (options.queueValidation === undefined) {
      options.queueValidation = true;
    }

    try {
      const charData = await this.albionApiService.getCharacter(characterName, server);

      const data: RegistrationData = {
        character: charData,
        discordMember: await this.discordService.getGuildMember(discordGuildId, discordMemberId),
        server,
        serverName: AlbionServer.EUROPE,
        serverEmoji: '🇪🇺',
        guildId: this.config.get('albion.guildId'),
        guildName: 'Dignity Of War',
        guildPingable: '@ALB/Archmage',
      };

      this.logger.debug(
        `Handling Albion character "${data.character.Name}" registration for "${data.discordMember.displayName}" on server "${data.server}"`,
      );

      await this.validate(data, options);

      // If we got here, we can safely register the character
      await this.registerCharacter(data, channel);

      // Note: queued registration status updates are managed by AlbionRegistrationRetryCronService.
    }
    catch (err) {
      this.throwError(`Registration failed for character "${characterName}"!\nReason: ${err.message}`);
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

  private async checkIfInGuild(data: RegistrationData) {
    const membership = await this.albionApiService.checkCharacterGuildMembership(
      data.character.Name,
      data.server,
      data.guildId,
    );

    if (membership) {
      return;
    }

    // Enqueue a retryable attempt.
    const now = new Date();
    const expiresAt = new Date(now);
    expiresAt.setHours(expiresAt.getHours() + 72);

    const entity = this.albionRegistrationQueueRepository.create({
      guildId: data.guildId,
      discordGuildId: data.discordMember.guild.id,
      discordChannelId: this.verificationChannelId,
      discordId: String(data.discordMember.user.id),
      characterName: data.character.Name,
      server: data.server,
      attemptCount: 0,
      expiresAt,
      status: AlbionRegistrationQueueStatus.PENDING,
      lastError: 'Character not detected in guild yet.',
    });
    await this.albionRegistrationQueueRepository.upsert(entity);

    const expiresDiscordTime = `<t:${Math.floor(expiresAt.getTime() / 1000)}:f>`;

    this.throwError(
      `<@${data.discordMember.id}> the character **${data.character.Name}** has not been detected in the ${data.serverEmoji} **${data.guildName}** Guild.\n\n ➡️ **Please ensure you have spelt your character __exactly__ correct as it appears in-game**. If you have mis-spelt it, please run the command again with the correct spelling.\n\n## ⏳ We will automatically retry your registration attempt hourly until ${expiresDiscordTime}.\n Sometimes our data source is slow to update, so please be patient. **If you are not a member of DIG, this WILL fail regardless.**`,
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
