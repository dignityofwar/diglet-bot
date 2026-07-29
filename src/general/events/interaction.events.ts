import { Injectable, Logger } from '@nestjs/common';
import { Context, ContextOf, On } from 'necord';
import { ChatInputCommandInteraction, CommandInteractionOption } from 'discord.js';

@Injectable()
export class InteractionEvents {
  private readonly logger = new Logger(InteractionEvents.name);

  // Single listener rather than a log line per command, so new commands are covered automatically.
  @On('interactionCreate')
  onInteractionCreate(
    @Context() [interaction]: ContextOf<'interactionCreate'>,
  ): void {
    if (!interaction.isChatInputCommand()) return;

    const args = interaction.options.data.map((option) => this.formatOption(option)).join(' ');
    const location = this.formatLocation(interaction);

    this.logger.log(
      `/${interaction.commandName} by ${interaction.user.username} (${interaction.user.id}) in ${location} args: ${args || 'none'}`,
    );
  }

  private formatLocation(interaction: ChatInputCommandInteraction): string {
    if (!interaction.channelId) return 'DM';

    // DM channels have no name, and the channel can be uncached, so fall back to the bare ID.
    const channel = interaction.channel;
    const name = channel && 'name' in channel ? channel.name : null;

    return name ? `#${name} (${interaction.channelId})` : `channel ${interaction.channelId}`;
  }

  private formatOption(option: CommandInteractionOption): string {
    // Subcommands and groups carry their arguments in a nested options array.
    if (option.options?.length) {
      const nested = option.options.map((child) => this.formatOption(child)).join(' ');
      return `${option.name}(${nested})`;
    }

    // Resolved entities arrive as objects, so log the identity rather than "[object Object]".
    if (option.user) return `${option.name}=@${option.user.username}(${option.user.id})`;
    if (option.channel) return `${option.name}=#${option.channel.id}`;
    if (option.role) return `${option.name}=&${option.role.id}`;

    return `${option.name}=${option.value ?? 'null'}`;
  }
}
