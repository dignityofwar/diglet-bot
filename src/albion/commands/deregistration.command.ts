import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { AlbionDeregistrationService } from '../services/albion.deregistration.service';

@Command({
  name: 'albion-deregister',
  type: ApplicationCommandType.ChatInput,
  description: 'Deregisters an Albion member from the guild',
})
@Injectable()
export class AlbionDeregisterCommand {
  private readonly logger = new Logger(AlbionDeregisterCommand.name);

  constructor(
    private readonly albionDeregistrationService: AlbionDeregistrationService,
  ) {}

  @Handler()
  async onAlbionRegisterCommand(
    @InteractionEvent(SlashCommandPipe) dto: AlbionRegisterDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<void> {
    this.logger.debug('Received Albion Deregister Command');

    // Create placeholder message
    const message = await interaction[0].channel.send(`Deregistration process for ${dto.character} started. Please wait...`);

    await this.albionDeregistrationService.deregister(
      interaction[0].member.user.id,
      message.channel,
    );

    // Delete placeholder
    await message.delete();
  }
}
