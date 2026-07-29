import { Context, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class HelloThereCommand {
  private readonly logger = new Logger(HelloThereCommand.name);

  // Deliberately longer than Discord's 3 second acknowledgement window. Without the deferral
  // below this command would always fail with "The application did not respond".
  private static readonly DELAY_MS = 5000;

  @SlashCommand({
    name: 'hello-there',
    description: 'General Kenobi',
  })
  async onHelloThereCommand(
    @Context() [interaction]: SlashCommandContext,
  ): Promise<void> {
    this.logger.debug('Received Hello There Command');

    await interaction.deferReply();
    await this.delay(HelloThereCommand.DELAY_MS);
    await replyTo(interaction, 'General Kenobi!');
  }

  protected delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
