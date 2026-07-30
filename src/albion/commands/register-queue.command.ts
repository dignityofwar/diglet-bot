import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MessageFlags } from 'discord.js';
import { AlbionRegisterQueueDto } from '../dto/albion.register.queue.dto';
import { AlbionRegistrationQueueService } from '../services/albion.registration.queue.service';
import { DiscordService } from '../../discord/discord.service';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class AlbionRegisterQueueCommand {
  private readonly logger = new Logger(AlbionRegisterQueueCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    private readonly albionRegistrationQueueService: AlbionRegistrationQueueService,
  ) {}

  @SlashCommand({
    name: 'albion-register-queue',
    description: 'Force a member into the Albion registration queue, skipping the character lookup.',
  })
  async onAlbionRegisterQueueCommand(
    @Options() dto: AlbionRegisterQueueDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.log(`Received Albion Register Queue Command for "${dto.character}"`);

    // Queueing hits the database before replying, which blows Discord's 3s window.
    await interaction.deferReply();

    let result: Awaited<ReturnType<AlbionRegistrationQueueService['forceQueue']>>;

    try {
      result = await this.albionRegistrationQueueService.forceQueue(
        dto.character,
        dto.discordMember.id,
        interaction.guildId,
      );
    }
    catch (err) {
      this.logger.error(err.message);
      return replyTo(interaction, `⛔️ **ERROR:** ${err.message}`);
    }

    const expiresDiscordTime = `<t:${Math.floor(result.expiresAt.getTime() / 1000)}:f>`;
    const verb = result.requeued ? 're-queued' : 'queued';

    await this.notifyMember(dto.character, dto.discordMember.id, expiresDiscordTime);

    return replyTo(
      interaction,
      `✅ **${result.characterName}** has been ${verb} for <@${dto.discordMember.id}>. It will be retried hourly until ${expiresDiscordTime}.`,
    );
  }

  // Tell the member in the registration channel, since staff usually run this somewhere else.
  private async notifyMember(
    characterName: string,
    discordMemberId: string,
    expiresDiscordTime: string,
  ): Promise<void> {
    const registrationChannelId = this.config.get('discord.channels.albionRegistration');

    try {
      const channel = await this.discordService.getTextChannel(registrationChannelId);
      await channel.send({
        content: `<@${discordMemberId}> your registration for **${characterName}** has been manually queued by staff.\n\n## ⏳ We will automatically retry your registration attempt hourly until ${expiresDiscordTime}.\nYou don't need to do anything else, and running the registration command again won't speed it up.`,
        flags: MessageFlags.SuppressEmbeds,
      });
    }
    catch (err) {
      this.logger.error(`Failed to notify member of forced queue: ${err.message}`);
    }
  }
}
