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

    // Start processing the character
    try {
      character = await this.albionApiService.getCharacter(dto.character);
      await this.albionRegistrationService.handleRegistration(character, member);
    }
    catch (err) {
      this.logger.error(err.message);
      return `⛔️ **ERROR:** ${err.message}`;
    }

    this.logger.log(`Registration for ${character.Name} was successful, returning success response.`);

    // Successful!
    return `## ✅ Thank you **${character.Name}**, you've been verified as a [DIG] guild member! 🎉
    \n* ➡️ Please read the information within <#${this.config.get('discord.channels.albionWelcomeToAlbion')}> to be fully acquainted with the guild!
    \n* 👉️ Grab opt-in roles of interest in <id:customize> under the Albion section! It is _important_ you do this, otherwise you may miss content.
    \n* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.`;
  }
}
