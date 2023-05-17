import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { DatabaseService } from '../../database/database.service';
import { AlbionApiService } from '../services/albion.api.service';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Command({
  name: 'albion-register',
  type: ApplicationCommandType.ChatInput,
  description: 'Register to the DIG Albion Online guild',
})
@Injectable()
export class AlbionRegisterCommand {
  constructor(
    @Inject(DatabaseService) private readonly databaseService: DatabaseService,
    private readonly albionApiService: AlbionApiService,
    private readonly config: ConfigService
  ) {}

  @Handler()
  async onAlbionRegisterCommand(
    @InteractionEvent(SlashCommandPipe) dto: AlbionRegisterDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<string> {
    // Check if the command came from the correct channel ID
    const registrationChannelId = this.config.get('discord.channels.albionRegistration');

    // Check if channel is correct
    if (interaction[0].channelId !== registrationChannelId) {
      return `Please use the <#${registrationChannelId}> channel to register.`;
    }

    // Get the character from the Albion Online API
    const character = await this.albionApiService.getCharacter(dto.character);

    const gameGuildId = this.config.get('albion.guildGameId');

    // Check if the character is in the guild
    if (!character.data.GuildId || character.data.GuildId !== gameGuildId) {
      return `Your character "${character}" is not in the guild. If you are in the guild, please ensure you have spelt the name **exactly** correct. If it still doesn't work, try again later as our data source may be out of date.`;
    }

    // Get the guild member to be able to edit things about them
    const guildMember = await interaction[0].guild?.members.fetch(interaction[0].user.id);

    // Edit their nickname to match their ingame
    try {
      await guildMember?.setNickname(character.data.Name);
    }
    catch (err) {
      return `Unable to set your nickname. If you're an admin this won't work as the bot has no power over you! Pinging <@${this.config.get('discord.devUserId')}}>!`;
    }

    // Find the initiate role
    const initiateRoleId = this.config.get('discord.roles.albionInitiateRoleId');
    const initiateRole = await interaction[0].guild?.roles.fetch(initiateRoleId);

    if (!initiateRole) {
      return `Unable to find the initiate role! Pinging <@${this.config.get('discord.devUserId')}>!`;
    }

    // Add the initiate role
    try {
      await guildMember?.roles.add(initiateRole);
    }
    catch (err) {
      return `Unable to add the initiate role to user! Pinging <@${this.config.get('discord.devUserId')}>!`;
    }

    // Successful!
    return `Thank you ${character.data.Name}, you've been verified as a [DIG] guild member! Please read the information within <#${this.config.get('discord.channels.albionWelcomeToAlbion')}> to be fully acquainted with the guild! Don't forget to grab roles for areas of interest in the "Channels & Roles" menu right at the top of this server!`;
  }
}
