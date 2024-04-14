import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction, GuildMember } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
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
    const message = await interaction[0].channel.send('🔍 Running registration process...');

    try {
      await this.albionRegistrationService.handleRegistration(dto, member, message);
    }
    catch (err) {
      await message.edit(`⛔️ **ERROR:** ${err.message}`);
      this.logger.error(err.message);
      // return '';
    }

    // Temp reminder about EU registrations
    await interaction[0].channel.send('# Reminder: EU Guild registrations are currently not possible.\n' +
      'Please send a message in <#1216143660337332224> stating your in game character name and we\'ll manually give you a role for now.');

    // Successful! Success message now within handleRegistration.
    return '';
  }
}
