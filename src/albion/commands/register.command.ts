import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { DatabaseService } from '../../database/database.service';
import { AlbionConsts } from '../consts/albion.consts';
import { AlbionApiService } from '../services/albion.api.service';
import { Inject, Injectable } from '@nestjs/common';

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
  ) {}

  @Handler()
  async onAlbionRegisterCommand(
    @InteractionEvent(SlashCommandPipe) dto: AlbionRegisterDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<string> {
    // Check if the command came from the correct channel ID
    const registrationChannelId = await this.databaseService.getConfigItem(AlbionConsts.registrationChannelIdKey);

    // Check if channel is correct
    if (interaction[0].channelId !== registrationChannelId) {
      return `Please use the <#${registrationChannelId}> channel to register.`;
    }

    // Get the character from the Albion Online API
    const character = await this.albionApiService.getCharacter(dto.character);

    const guildId = await this.databaseService.getConfigItem(AlbionConsts.guildGameIdKey);

    // Check if the character is in the guild
    if (!character.data.GuildId || character.data.GuildId !== guildId) {
      return `Your character "${character}" is not in the guild. If you are in the guild, please ensure you have spelt the name **exactly** correct. If it still doesn't work, try again later as our data source may be out of date.`;
    }

    // Get the guild member to be able to edit things about them
    const guildMember = await interaction[0].guild?.members.fetch(interaction[0].user.id);

    // Edit their nickname to match their ingame
    try {
      await guildMember?.setNickname(character.data.Name);
    }
    catch (err) {
      return 'Unable to set your nickname. If you\'re an admin this won\'t work as the bot has no power over you! Pinging <@90078072660852736>!';
    }

    // Find the initiate role
    const initiateRoleId = await this.databaseService.getConfigItem(AlbionConsts.initiateRoleIdKey);
    const initiateRole = await interaction[0].guild?.roles.fetch(initiateRoleId);

    if (!initiateRole) {
      return 'Unable to find the initiate role! Pinging <@90078072660852736>!';
    }

    // Add the initiate role
    try {
      await guildMember?.roles.add(initiateRole);
    }
    catch (err) {
      return 'Unable to add the initiate role to user! Pinging <@90078072660852736>!';
    }

    // Successful!
    return `Thank you ${character.data.Name}, you've been verified as a [DIG] guild member! Please read the information within <#1039269859814559764> to be fully acquainted with the guild! Don't forget to grab roles for areas of interest in the "Channels & Roles" menu right at the top of this server!`;
  }
}
