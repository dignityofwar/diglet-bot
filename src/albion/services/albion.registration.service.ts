import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { EntityRepository } from '@mikro-orm/core';
import { Channel, GuildMember, Message } from 'discord.js';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';

@Injectable()
export class AlbionRegistrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRegistrationService.name);

  private verificationChannel: Channel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    @InjectRepository(AlbionMembersEntity) private readonly albionMembersRepository: EntityRepository<AlbionMembersEntity>,
  ) {
  }

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
    }
    catch (err) {
      this.throwError(`Required Roles do not exist! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }

    // 2. Check if the user is in the guild
    const guildId = this.config.get('albion.guildId');

    // Check if the character is in the Albion guild
    if (character.GuildId !== guildId) {
      this.throwError(`The character **${character.Name}** is not in the guild. Please ensure you have spelt the name **exactly** correct (case sensitive) **and** you are a member of the "DIG - Dignity of War" guild in the game before trying again. If you have just joined us, please wait ~10 minutes. If you are still having issues, please contact the Albion Guild Masters.`);
    }

    // 3. Check if the character has already been registered
    const foundMember = await this.albionMembersRepository.find({ characterId: character.Id });

    if (foundMember.length > 0) {
      // Get the original Discord user, if possible
      let originalDiscordMember: GuildMember;
      try {
        originalDiscordMember = await this.discordService.getOtherGuildMember(guildMember, foundMember[0].discordId);
      }
      catch (err) {
        this.logger.warn(`Unable to find original Discord user for character "${character.Name}"! Err: ${err.message}`);
      }

      if (!originalDiscordMember) {
        this.throwError(`Character **${character.Name}** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the Albion Guild Masters.`);
      }

      this.throwError(`Character **${character.Name}** has already been registered by Discord user \`@${originalDiscordMember.displayName}\`. If this is you, you don't need to do anything. If you believe this to be in error, please contact the Albion Guild Masters.`);
    }

    const discordMember = await this.albionMembersRepository.find({ discordId: guildMember.id });
    if (discordMember.length > 0) {
      this.throwError(`You have already registered a character named **${discordMember[0].characterName}**. We don't allow multiple characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or you have registered the wrong character, please contact the Albion Guild Masters.`);
    }

    this.logger.debug(`Registration attempt for "${character.Name}" is valid`);

    return true;
  }

  async handleRegistration(character: AlbionPlayerInterface, guildMember: GuildMember, message: Message) {
    this.logger.debug(`Handling Albion character "${character.Name}" registration`);

    await this.validateRegistrationAttempt(character, guildMember);

    // Roles can be safely assumed to be present as it's checked at command level.
    const initiateRole = await this.discordService.getMemberRole(
      guildMember,
      this.config.get('discord.roles.albionInitiateRoleId')
    );
    const verifiedRole = await this.discordService.getMemberRole(
      guildMember,
      this.config.get('discord.roles.albionRegisteredRoleId')
    );

    // Add the initiate and verified roles
    try {
      await guildMember.roles.add(initiateRole);
      await guildMember.roles.add(verifiedRole);
    }
    catch (err) {
      this.throwError(`Unable to add the \`@ALB/Initiate\` or \`@ALB/Registered\` roles to user "${guildMember.displayName}"! Pinging <@${this.config.get('discord.devUserId')}>!`);
    }

    try {
      // Add the member to the database
      const entity = this.albionMembersRepository.create({
        discordId: guildMember.id,
        characterId: character.Id,
        characterName: character.Name,
      });
      await this.albionMembersRepository.upsert(entity);
    }
    catch (err) {
      this.throwError(`Unable to add you to the database! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }

    // Edit their nickname to match their ingame
    try {
      await guildMember?.setNickname(character.Name);
    }
    catch (err) {
      const errorMessage = `⚠️ Unable to set your nickname. If you're Staff this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}>!`;
      await message.channel.send(errorMessage);
      this.logger.error(errorMessage);
    }

    // Successful!
    await message.channel.send(`## ✅ Thank you **${character.Name}**, you've been verified as a [DIG] guild member! 🎉
    \n* ➡️ Please read the information within <#${this.config.get('discord.channels.albionInfopoint')}> to be fully acquainted with the guild!
    \n* 👉️ Grab opt-in roles of interest in <id:customize> under the Albion section! It is _important_ you do this, otherwise you may miss content.
    \n* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
    \nCC <@&${this.config.get('albion.guildMasterRole').discordRoleId}> / <@${this.config.get('discord.devUserId')}>`);

    // Delete the placeholder message
    await message.delete();
  }

  private throwError(error: string) {
    this.logger.error(error);
    throw new Error(error);
  }
}
