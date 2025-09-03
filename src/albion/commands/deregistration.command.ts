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
  async onAlbionDeregisterCommand(
    @InteractionEvent(SlashCommandPipe) dto: AlbionRegisterDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<void> {
    this.logger.debug('Received Albion Deregister Command');

    // Create placeholder message
    const message = await interaction[0].channel.send(`Deregistration process for ${dto.character} started. Please wait...`);

    try {
      await this.albionDeregistrationService.deregister(
        interaction[0].member.user.id,
        message.channel,
      );
    }
    catch (err) {
      this.logger.error('Error during deregistration process', err);
      await message.channel.send(`❌ An error occurred during the deregistration process. Error: ${err.message}`);
    }

    // Delete placeholder
    await message.delete();
  }
}
