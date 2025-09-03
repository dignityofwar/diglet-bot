import { Command, EventParams, Handler, InteractionEvent } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';
import { Injectable, Logger } from '@nestjs/common';
import { SlashCommandPipe } from '@discord-nestjs/common';
import { AlbionDeregistrationService } from '../services/albion.deregistration.service';
import { AlbionDeregisterDto } from '../dto/albion.deregister.dto';

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
    @InteractionEvent(SlashCommandPipe) dto: AlbionDeregisterDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<void> {
    this.logger.log('Received Albion Deregister Command', dto);

    // Create placeholder message
    const message = await interaction[0].channel.send(`Deregistration process for ${dto.character} started. Please wait...`);

    try {
      await this.albionDeregistrationService.deregister(
        message.channel,
        dto,
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
