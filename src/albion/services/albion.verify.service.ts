import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { EntityRepository } from '@mikro-orm/core';
import { Channel, GuildMember, Interaction } from 'discord.js';
import { AlbionPlayersResponseInterface } from '../interfaces/albion.api.interfaces';

@Injectable()
export class AlbionVerifyService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionVerifyService.name);

  private verificationChannel: Channel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    @InjectRepository(AlbionMembersEntity) private readonly albionMembersRepository: EntityRepository<AlbionMembersEntity>
  ) {
  }

  async onApplicationBootstrap() {
    // Store the Discord guild channel and ensure we can send messages to it
    const verifyChannelId = this.config.get('discord.channels.ps2Verify');

    this.verificationChannel = await this.discordService.getChannel(verifyChannelId);
    if (!this.verificationChannel) {
      throw new Error(`Could not find channel with ID ${verifyChannelId}`);
    }
    if (!this.verificationChannel.isTextBased()) {
      throw new Error(`Channel with ID ${verifyChannelId} is not a text channel`);
    }

    // We purposefully don't check if the verified role exists, as the bot could technically belong to multiple servers, and we'd have to start injecting the guild ID into the config service, which is a bit of a pain.
  }

  public async isValidRegistrationAttempt(character: AlbionPlayersResponseInterface, member: GuildMember): Promise<string | true> {
    this.logger.debug('Checking if registration attempt is valid');

    const guildMember = await this.albionMembersRepository.find({ characterId: character.data.Id });

    console.log(guildMember);

    if (guildMember.length > 0) {
      console.warn(`Character ${character.data.Name} has already been registered by user ${guildMember[0].discordId}`);
      // Get the original Discord user, if possible
      const originalDiscordMember = await this.discordService.getGuildMember(member, guildMember[0].discordId);

      if (originalDiscordMember === null) {
        return `⛔️ **ERROR:** Character **${character.data.Name}** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the Albion Guild Masters.`;
      }

      return `⛔️ **ERROR:** Character **${character.data.Name}** has already been registered by user \`@${originalDiscordMember.displayName}\`. If you believe this to be in error, please contact the Albion Guild Masters.`;
    }

    const discordMember = await this.albionMembersRepository.find({ discordId: member.id });
    if (discordMember.length > 0) {
      return `⛔️ **ERROR:** You have already registered a character named **${discordMember[0].characterName}**. We don't allow multiple characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or you have registered the wrong character, please contact the Albion Guild Masters.`;
    }

    return true;
  }

  async handleVerification(character: AlbionPlayersResponseInterface, interaction: Interaction) {
    this.logger.debug('Handling Albion character verification');

    const gameGuildId = this.config.get('albion.guildGameId');

    // Check if the character is in the Albion guild
    if (!character.data.GuildId || character.data.GuildId !== gameGuildId) {
      return `Your character "${character.data.Name}" is not in the guild. If you are in the guild, please ensure you have spelt the name **exactly** correct. If it still doesn't work, try again later as our data source may be out of date.`;
    }

    const guildMember = interaction.member as GuildMember;
    const initiateRole = await guildMember.guild.roles.fetch(this.config.get('discord.roles.albionInitiateRoleId'));
    const verifiedRole = await guildMember.guild.roles.fetch(this.config.get('discord.roles.albionVerifiedRoleId'));

    // Add the initiate and verified roles
    try {
      await guildMember?.roles.add(initiateRole);
      await guildMember?.roles.add(verifiedRole);
    }
    catch (err) {
      return `Unable to add the initiate and verified roles to user! Pinging <@${this.config.get('discord.devUserId')}>!`;
    }

    // Add the member to the database
    const entity = this.albionMembersRepository.create({
      discordId: guildMember.id,
      characterId: character.data.Id,
      characterName: character.data.Name,
    });

    await this.albionMembersRepository.upsert(entity);

    // Edit their nickname to match their ingame
    try {
      await guildMember?.setNickname(character.data.Name);
    }
    catch (err) {
      return `Unable to set your nickname. If you're an admin this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}>!`;
    }
  }
}
