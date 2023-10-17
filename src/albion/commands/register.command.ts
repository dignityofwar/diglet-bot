import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { AlbionApiService } from '../services/albion.api.service';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
import { AlbionRegistrationService } from '../services/albion.registration.service';

@Command({
  name: 'albion-register',
  type: ApplicationCommandType.ChatInput,
  description: 'Register to the DIG Albion Online guild!',
})
@Injectable()
export class AlbionRegisterCommand {
  private readonly logger = new Logger(AlbionRegisterCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly albionApiService: AlbionApiService,
    private readonly albionRegistrationService: AlbionRegistrationService,
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

    const member = interaction[0].member as GuildMember;

    // Get the character from the Albion Online API
    let character: AlbionPlayerInterface;

    const message = await interaction[0].channel.send('🔍 Validating character...');

    // Start processing the character
    try {
      character = await this.albionApiService.getCharacter(dto.character);
      await this.albionRegistrationService.handleRegistration(character, member, message);
    }
    catch (err) {
      await message.edit(`⛔️ **ERROR:** ${err.message}`);
      this.logger.error(err.message);
      return '⬇️';
    }

    this.logger.log(`Registration for ${character.Name} was successful, returning success response.`);

    // Successful! Success message now within handleRegistration.
    return '⬇️';
  }
}
