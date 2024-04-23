import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { EntityRepository } from '@mikro-orm/core';
import { Channel, GuildMember, Message, MessageFlags } from 'discord.js';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
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

  async validateRegistrationAttempt(character: AlbionPlayerInterface, guildMember: GuildMember): Promise<string | true> {
    this.logger.debug(`Checking if registration attempt for "${character.Name}" is valid`);

    // 1. Check if the roles to apply exist
    try {
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionInitiateRoleId'));
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionRegisteredRoleId'));
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionTownCrierRoleId'));
    }
    catch (err) {
      this.throwError(`Required Role(s) do not exist! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }

    // 2. Check if the user is in the guild
    const guildId = this.config.get('albion.guildId');

    if (character.GuildId !== guildId) {
      this.throwError(`Sorry <@${guildMember.id}>, the character **${character.Name}** has not been detected in the DIG guild. Please ensure that:\n
1. You have spelt the name **exactly** correct (case sensitive).
2. You are a member of the "DIG - Dignity of War" guild in the game before trying again.
\nIf you have just joined us, please wait ~10 minutes. If you are still having issues, please contact the Albion Guild Masters.`);
    }

    // 3. Check if the character has already been registered
    const foundMember = await this.albionRegistrationsRepository.find({ characterId: character.Id });

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
        this.throwError(`Sorry <@${guildMember.id}>, character **${character.Name}** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the Albion Guild Masters.`);
      }

      this.throwError(`Sorry <@${guildMember.id}>, character **${character.Name}** has already been registered by Discord user \`@${originalDiscordMember.displayName}\`. If this is you, you don't need to do anything. If you believe this to be in error, please contact the Albion Guild Masters.`);
    }

    // 4. Check if the user has already registered a character
    const discordMember = await this.albionRegistrationsRepository.find({ discordId: guildMember.id });
    if (discordMember.length > 0) {
      this.throwError(`Sorry <@${guildMember.id}>, you have already registered a character named **${discordMember[0].characterName}**. We don't allow multiple characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or if you have registered the wrong character, please contact the Albion Guild Masters.`);
    }

    this.logger.debug(`Registration attempt for "${character.Name}" is valid`);

    return true;
  }

  async handleRegistration(dto: AlbionRegisterDto, discordMember: GuildMember, message: Message) {
    this.logger.debug(`Handling Albion character "${dto.character}" registration`);

    let character: AlbionPlayerInterface;
    try {
      // Get the character from the Albion Online API
      character = await this.albionApiService.getCharacter(dto.character);
    }
    catch (err) {
      // Append "Sorry <person>, " to the error message
      this.throwError(`Sorry <@${discordMember.id}>, ${err.message}`);
    }

    await this.validateRegistrationAttempt(character, discordMember);

    // Add the initiate, verified and towncrier roles. We are safe to assume these roles exist as they are checked at the validateRegistrationAttempt step.
    try {
      await discordMember.roles.add(await this.discordService.getMemberRole(
        discordMember,
        this.config.get('discord.roles.albionInitiateRoleId')
      ));
      await discordMember.roles.add(await this.discordService.getMemberRole(
        discordMember,
        this.config.get('discord.roles.albionRegisteredRoleId')
      ));
      await discordMember.roles.add(await this.discordService.getMemberRole(
        discordMember,
        this.config.get('discord.roles.albionTownCrierRoleId')
      ));
    }
    catch (err) {
      this.throwError(`Unable to add registration role(s) to "${discordMember.displayName}"! Pinging <@${this.config.get('discord.devUserId')}>!\nErr: ${err.message}`);
    }

    try {
      // Add the member to the database
      const entity = this.albionRegistrationsRepository.create({
        discordId: discordMember.id,
        characterId: character.Id,
        characterName: character.Name,
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

    // Successful!
    const messageContent = `## ✅ Thank you <@${discordMember.id}>, your character **${character.Name}** has been verified! 🎉

* ➡️ Please read the information within <#${this.config.get('discord.channels.albionInfopoint')}> to be fully acquainted with the guild!
* 👉️ **IMPORTANT**: [Grab opt-in roles for various content you're interested in](https://discord.com/channels/90078410642034688/1039269859814559764)!
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${this.config.get('discord.channels.albionTownCrier')}> announcements channel. If you wish to opt out, go to the [#welcome-to-albion](https://discord.com/channels/90078410642034688/1039268966905954394/1204480244405243954) channel, double tap the 🔔 icon.

CC <@&${this.config.get('albion.masterRole').discordRoleId}>, <@&${this.config.get('albion.guildMasterRole').discordRoleId}>`;
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
