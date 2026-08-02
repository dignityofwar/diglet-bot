import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { GuildMember, MessageFlags } from 'discord.js';
import { AlbionForceRegisterDto } from '../dto/albion.force.register.dto';
import {
  ALBION_FORCE_REGISTER_RANK,
  AlbionForceRegistrationService,
} from '../services/albion.force.registration.service';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class AlbionForceRegisterCommand {
  private readonly logger = new Logger(AlbionForceRegisterCommand.name);

  constructor(
    private readonly albionForceRegistrationService: AlbionForceRegistrationService,
    private readonly albionUtilities: AlbionUtilities,
  ) {}

  @SlashCommand({
    name: 'albion-force-register',
    description: 'Register a character to a member, skipping the guild membership check entirely.',
  })
  async onAlbionForceRegisterCommand(
    @Options() dto: AlbionForceRegisterDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    const performedBy = interaction.member as GuildMember;

    // Gated to the same Eldritch Mage and above set that votes on rank ups. Checked before the
    // defer so the refusal can stay private to whoever tried it. Outside a guild there is no
    // member to check roles on, so fail closed rather than throw on the cast.
    if (!performedBy?.roles?.cache || !this.albionUtilities.isElector(performedBy)) {
      const denial = '⛔️ You do not have permission to run this command. It is restricted to `@ALB/EldritchMage` and above.';
      await interaction.reply({
        content: denial,
        flags: MessageFlags.Ephemeral,
      });
      return denial;
    }

    this.logger.log(`Received Albion Force Register Command for "${dto.character}"`);

    // Registration hits the Albion API and the database before replying, which blows Discord's 3s window.
    await interaction.deferReply();

    let result: Awaited<ReturnType<AlbionForceRegistrationService['forceRegister']>>;

    try {
      result = await this.albionForceRegistrationService.forceRegister(
        dto.character,
        dto.discordMember.id,
        interaction.guildId,
        performedBy,
      );
    }
    catch (err) {
      this.logger.error(err.message);
      return replyTo(interaction, `⛔️ **ERROR:** ${err.message}`);
    }

    let queueNote = result.queueResolved
      ? ' Their queued registration attempt has been marked as succeeded.'
      : '';

    // The registration itself is done at this point, so a queue failure is a warning, not an error.
    if (result.queueError) {
      queueNote = `\n\n⚠️ Their queued registration attempt could not be closed out, so the retry cron may still pick it up. Err: ${result.queueError}`;
    }

    return replyTo(
      interaction,
      `✅ **${result.characterName}** has been force registered to <@${result.discordMember.id}> with the \`${ALBION_FORCE_REGISTER_RANK}\` rank.${queueNote}\n\n⚠️ The guild membership check was skipped, so the next scan will strip them if they are not actually in the guild.`,
    );
  }
}
