import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { AlbionDeregistrationService } from '../services/albion.deregistration.service';
import { AlbionDeregisterDto } from '../dto/albion.deregister.dto';
import { replyTo } from '../../discord/discord.hacks';

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

    // Deregistration hits the database before replying, which blows Discord's 3s window.
    await interaction.deferReply();

    // If neither character nor discordMember is provided, throw
    if (!dto.character && !dto.discordMember) {
      await replyTo(interaction, '❌ You must provide either a character name or a Discord member to deregister.');
      return;
    }

    const name = dto.character ?? dto.discordMember?.id ?? 'Unknown';

    // Create placeholder message
    const message = await interaction.channel.send(`Deregistration process for ${name} started. Please wait...`);

    let outcome = `Deregistration process for ${name} complete.`;

    try {
      await this.albionDeregistrationService.deregister(
        message.channel,
        dto,
      );
    }
    catch (err) {
      this.logger.error('Error during deregistration process', err);
      outcome = `❌ An error occurred during the deregistration process for ${name}. Error: ${err.message}`;
      await message.channel.send(outcome);
    }

    // Delete placeholder
    await message.delete();

    // Without this the deferred "thinking..." state never resolves.
    await replyTo(interaction, outcome);
  }
}
