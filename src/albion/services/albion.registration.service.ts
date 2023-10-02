import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { EntityRepository } from '@mikro-orm/core';
import { Channel, GuildMember } from 'discord.js';
import { AlbionPlayersResponseInterface } from '../interfaces/albion.api.interfaces';

@Injectable()
export class AlbionRegistrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRegistrationService.name);

  private verificationChannel: Channel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    @InjectRepository(AlbionMembersEntity) private readonly albionMembersRepository: EntityRepository<AlbionMembersEntity>
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

  async validateRegistrationAttempt(character: AlbionPlayersResponseInterface, guildMember: GuildMember): Promise<string | true> {
    this.logger.debug(`Checking if registration attempt for "${character.data.Name}" is valid`);

    // 1. Check if the roles to apply exist
    try {
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionInitiateRoleId'));
      await this.discordService.getMemberRole(guildMember, this.config.get('discord.roles.albionVerifiedRoleId'));
    }
    catch (err) {
      this.throwError(`Required Roles do not exist! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }

    // 2. Check if the user is in the guild
    const gameGuildId = this.config.get('albion.guildGameId');

    // Check if the character is in the Albion guild
    if (character.data.GuildId !== gameGuildId) {
      this.throwError(`Your character **${character.data.Name}** is not in the guild. Please ensure you have spelt the name **exactly** correct. If it still doesn't work, try again later as our data source may be out of date.`);
    }

    // 3. Check if the character has already been registered
    const foundMember = await this.albionMembersRepository.find({ characterId: character.data.Id });

    if (foundMember.length > 0) {
      // Get the original Discord user, if possible
      const originalDiscordMember = await this.discordService.getGuildMember(guildMember, foundMember[0].discordId);

      if (originalDiscordMember === null) {
        this.throwError(`Character **${character.data.Name}** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the Albion Guild Masters.`);
      }

      this.throwError(`Character **${character.data.Name}** has already been registered by user \`@${originalDiscordMember.displayName}\`. If you believe this to be in error, please contact the Albion Guild Masters.`);
    }

    const discordMember = await this.albionMembersRepository.find({ discordId: guildMember.id });
    if (discordMember.length > 0) {
      this.throwError(`You have already registered a character named **${discordMember[0].characterName}**. We don't allow multiple characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or you have registered the wrong character, please contact the Albion Guild Masters.`);
    }

    console.log(`Registration attempt for "${character.data.Name}" is valid`);

    return true;
  }

  async handleRegistration(character: AlbionPlayersResponseInterface, guildMember: GuildMember) {
    this.logger.debug(`Handling Albion character "${character.data.Name}" registration`);

    await this.validateRegistrationAttempt(character, guildMember);

    // Roles can be safely assumed to be present as it's checked at command level.
    const initiateRole = await this.discordService.getMemberRole(
      guildMember,
      this.config.get('discord.roles.albionInitiateRoleId')
    );
    const verifiedRole = await this.discordService.getMemberRole(
      guildMember,
      this.config.get('discord.roles.albionVerifiedRoleId')
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
        characterId: character.data.Id,
        characterName: character.data.Name,
      });
      await this.albionMembersRepository.upsert(entity);
    }
    catch (err) {
      this.throwError(`Unable to add you to the database! Pinging <@${this.config.get('discord.devUserId')}>! Err: ${err.message}`);
    }

    // Edit their nickname to match their ingame
    try {
      await guildMember?.setNickname(character.data.Name);
    }
    catch (err) {
      this.throwError(`Unable to set your nickname. If you're Staff this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}>!`);
    }
  }

  private throwError(error: string) {
    console.error(error);
    throw new Error(error);
  }
}
