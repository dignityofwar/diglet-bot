import { Context, SlashCommand, SlashCommandContext } from 'necord';
import { ConfigService } from '@nestjs/config';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PingCommand {
  private readonly logger = new Logger(PingCommand.name);
  constructor(
    private readonly config: ConfigService,
  ) {}

  @SlashCommand({
    name: 'ping',
    description: 'Return a ping from the bot',
  })
  async onPingCommand(@Context() [interaction]: SlashCommandContext): Promise<void> {

    const content = `Hello ${interaction.user.username}, I'm alive! Version: ${this.config.get('app.version')}`;

    await interaction.reply({
      content,
    });

    this.logger.log('Ping command executed!');
  }
}
