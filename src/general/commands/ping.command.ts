import { Command, Handler } from '@discord-nestjs/core';
import { ApplicationCommandType, ChatInputCommandInteraction } from 'discord.js';

@Command({
  name: 'ping',
  type: ApplicationCommandType.ChatInput,
  description: 'Return a ping from the bot',
})
export class PingCommand {
  @Handler()
  async onPingCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const content = `Hello ${interaction.user.username}, I'm alive!`;

    await interaction.reply({
      ephemeral: true,
      content,
    });

    console.log('Ping command executed!');
  }
}
