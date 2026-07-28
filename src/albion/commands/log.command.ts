import { Context, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class AlbionLogCommand {
  private readonly logger = new Logger(AlbionLogCommand.name);

  @SlashCommand({
    name: 'the-log-is-life',
    description: 'ALL HAIL THE LOG',
  })
  async onAlbionLogCommand(
    @Context() [interaction]: SlashCommandContext,
  ): Promise<void> {
    this.logger.debug('Received Albion Log Command');

    const images = [
      'https://cdn.discordapp.com/attachments/1039269706605002912/1159810488088154122/image.png?ex=653b9b30&is=65292630&hm=bd8a57e7667948ffad446b27f32a1b6e64733f4aa7929417e3afd78e1e53e993&',
      'https://cdn.discordapp.com/attachments/1039269706605002912/1163504299221983393/image-17.png?ex=653fd0d1&is=652d5bd1&hm=8827de8b5eeb9180a0f92fc41c075837ba415cbafee76c1a1dc21d20074b3b9e&',
      'https://cdn.discordapp.com/attachments/842478726218383370/1180607912834519070/image.png?ex=657e09cd&is=656b94cd&hm=1208c1872ce6e87a003975ffa8d567592e895cfadd380e65c36d9c596c40dc5d&',
    ];
    await interaction.channel.send(`# 🪵\n
Live by the log,
Die by the log.
The log is life, the log is true
The log shall conquer,
The log is good,
The log is hard,
The log is girthy, the log is big.
The log will log our logs with speed.`);
    (await interaction.channel.send(images[Math.floor(Math.random() * images.length)])).react('🪵');
  }
}
