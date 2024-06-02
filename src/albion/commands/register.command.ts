import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction, GuildMember, Message } from 'discord.js';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlbionRegistrationService } from '../services/albion.registration.service';
import { AlbionServer } from '../interfaces/albion.api.interfaces';

@Command({
  name: 'albion-register',
  type: ApplicationCommandType.ChatInput,
  description: 'Register to the DIG Albion Online Guilds!',
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

    // Create placeholder message
    const message = await interaction[0].channel.send('🔍 Running registration process...');

    this.registrationCommandProxy(
      dto.character,
      dto.server,
      member.id,
      member.guild.id,
      interaction[0].channelId,
      message
    );

    // Successful! Success message now within handleRegistration.
    return 'Registration request sent!';
  }

  // This is here so we can respond in the command immediately so the command doesn't "fail", and then handle the registration in the background
  async registrationCommandProxy(
    characterName: string,
    server: AlbionServer,
    discordMemberId: string,
    discordMemberGuildId: string,
    discordChannelId: string,
    message: Message
  ) {
    try {
      await this.albionRegistrationService.handleRegistration(
        characterName,
        server,
        discordMemberId,
        discordMemberGuildId,
        discordChannelId
      );
    }
    catch (err) {
      await message.edit(`⛔️ **ERROR:** ${err.message}`);
      this.logger.error(err.message);
    }

    // Delete the placeholder
    await message.delete();
  }
}
