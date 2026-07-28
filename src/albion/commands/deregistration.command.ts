import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { AlbionDeregistrationService } from '../services/albion.deregistration.service';
import { AlbionDeregisterDto } from '../dto/albion.deregister.dto';

@Injectable()
export class AlbionDeregisterCommand {
  private readonly logger = new Logger(AlbionDeregisterCommand.name);

  constructor(
    private readonly albionDeregistrationService: AlbionDeregistrationService,
  ) {}

  @SlashCommand({
    name: 'albion-deregister',
    description: 'Deregisters an Albion member from the guild',
  })
  async onAlbionDeregisterCommand(
    @Options() dto: AlbionDeregisterDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<void> {
    this.logger.log('Received Albion Deregister Command', dto);

    // If neither character nor discordMember is provided, throw
    if (!dto.character && !dto.discordMember) {
      await interaction.reply('❌ You must provide either a character name or a Discord member to deregister.');
      return;
    }

    const name = dto.character ?? dto.discordMember?.id ?? 'Unknown';

    // Create placeholder message
    const message = await interaction.channel.send(`Deregistration process for ${name} started. Please wait...`);

    try {
      await this.albionDeregistrationService.deregister(
        message.channel,
        dto,
      );
    }
    catch (err) {
      this.logger.error('Error during deregistration process', err);
      await message.channel.send(`❌ An error occurred during the deregistration process for ${name}. Error: ${err.message}`);
    }

    // Delete placeholder
    await message.delete();
  }
}
