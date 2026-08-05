import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PermissionFlagsBits } from 'discord.js';
import { OnboardingNudgeDto } from '../dto/onboarding.nudge.dto';
import { OnboardingNudgeCronService } from '../services/onboarding.nudge.cron.service';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class OnboardingNudgeCommand {
  private readonly logger = new Logger(OnboardingNudgeCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly onboardingNudgeCronService: OnboardingNudgeCronService,
  ) {}

  // A live run mentions real members in a public channel, so the channel check alone is too
  // thin a gate for it - Discord hides the command outright from anyone without the permission.
  @SlashCommand({
    name: 'onboarding-nudge',
    description: 'Report who is sat on only the Onboarded role, and optionally nudge them now.',
    defaultMemberPermissions: PermissionFlagsBits.ManageRoles,
  })
  async onOnboardingNudgeCommand(
    @Options() dto: OnboardingNudgeDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.log('Received Onboarding Nudge Command');

    // Fetching every guild member blows Discord's 3s window
    await interaction.deferReply();

    // necord ignores DTO field initialisers, so an omitted option arrives as null. Defaulting
    // to a dry run keeps a bare invocation from calling real people out in public.
    const dryRun = dto.dryRun ?? true;

    const botJobsChannelId = this.config.get('discord.channels.botJobs');

    if (interaction.channelId !== botJobsChannelId) {
      return replyTo(interaction, `Please use the <#${botJobsChannelId}> channel to run the onboarding nudge.`);
    }

    try {
      return replyTo(interaction, await this.onboardingNudgeCronService.run(dryRun));
    }
    catch (err) {
      this.logger.error(err.message);
      return replyTo(interaction, `⛔️ **ERROR:** Could not run the onboarding nudge. Err: ${err.message}`);
    }
  }
}
