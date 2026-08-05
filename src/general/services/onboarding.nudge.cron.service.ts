import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DiscordService } from '../../discord/discord.service';
import { OnboardingNudgeEntity } from '../../database/entities/onboarding.nudge.entity';
import { generateDateInPast } from '../../helpers';

@Injectable()
export class OnboardingNudgeCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(OnboardingNudgeCronService.name);

  private readonly onboardedRoleName = 'Onboarded';
  // Long enough that nobody gets called out in public within a day of arriving
  private readonly graceDays = 3;
  private readonly maxPerRun = 5;
  // A run that pinged people but couldn't record it will ping the same people next tick.
  // Twice in a row is a broken database, not a blip, so the job stands down until a restart.
  private readonly maxConsecutiveFailures = 2;

  private guildId: string;
  private chitChatChannel: TextChannel;
  private botJobsChannel: TextChannel;
  private roleSelectionChannelId: string;

  private enabled = false;
  private isRunning = false;
  private consecutiveFailures = 0;

  constructor(
    @InjectRepository(OnboardingNudgeEntity) private readonly nudgeRepository: EntityRepository<OnboardingNudgeEntity>,
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
  ) {}

  // Missing config disables this job only. Throwing would take every command and event handler
  // in the bot down with it, which is far too much for one optional automation.
  async onApplicationBootstrap(): Promise<void> {
    this.guildId = this.config.get('discord.guildId');
    const chitChatId = this.config.get('discord.channels.chitChat');
    const botJobsId = this.config.get('discord.channels.botJobs');
    this.roleSelectionChannelId = this.config.get('discord.channels.roleSelection');

    const missing = [
      ['GUILD_ID_WITH_COMMANDS', this.guildId],
      ['CHANNEL_CHIT_CHAT', chitChatId],
      ['CHANNEL_BOT_JOBS', botJobsId],
      ['CHANNEL_ROLES', this.roleSelectionChannelId],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length > 0) {
      this.logger.error(`Onboarding nudge job disabled, missing config: ${missing.join(', ')}`);
      return;
    }

    try {
      this.chitChatChannel = await this.discordService.getTextChannel(chitChatId);
      this.botJobsChannel = await this.discordService.getTextChannel(botJobsId);
    }
    catch (err) {
      this.logger.error(`Onboarding nudge job disabled, could not resolve its channels: ${err.message}`);
      return;
    }

    if (!this.chitChatChannel?.isTextBased() || !this.botJobsChannel?.isTextBased()) {
      this.logger.error('Onboarding nudge job disabled, CHANNEL_CHIT_CHAT or CHANNEL_BOT_JOBS is not a text channel');
      return;
    }

    this.enabled = true;
    this.logger.log('Onboarding nudge job ready');
  }

  @Cron('0 */3 * * *')
  async runNudgeJob(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    if (this.consecutiveFailures >= this.maxConsecutiveFailures) {
      this.logger.warn('Onboarding nudge job stood down after repeated failures to record nudges');
      return;
    }

    try {
      this.logger.log(await this.run());
    }
    catch (err) {
      this.logger.error(`Onboarding nudge run failed: ${err.message}`);
      await this.log(`⛔️ Onboarding nudge run failed: ${err.message}`);
    }
  }

  // Guarded here rather than in the cron so a manual run can't overlap a scheduled one and
  // ping the same batch twice.
  async run(dryRun = false): Promise<string> {
    if (this.isRunning) {
      return '⏳ An onboarding nudge run is already in progress, skipping this one.';
    }

    this.isRunning = true;

    try {
      return await this.execute(dryRun);
    }
    finally {
      this.isRunning = false;
    }
  }

  private async execute(dryRun: boolean): Promise<string> {
    if (!this.enabled) {
      throw new Error('The onboarding nudge job is not configured. Check CHANNEL_CHIT_CHAT, CHANNEL_BOT_JOBS and CHANNEL_ROLES are set.');
    }

    const candidates = await this.findCandidates();

    if (candidates.length === 0) {
      return 'No members are sat on only the Onboarded role right now.';
    }

    const batch = candidates.slice(0, this.maxPerRun);
    const names = batch.map(member => member.displayName).join(', ');
    const waiting = candidates.length - batch.length;

    if (dryRun) {
      return `[DRY RUN] ${candidates.length} member(s) eligible. A real run would nudge ${batch.length} now: ${names}`;
    }

    // The allowlist is explicit so a later edit to the wording can't turn this into a role or
    // @everyone ping in a public channel.
    await this.chitChatChannel.send({
      content: `👋 ${batch.map(member => `<@${member.id}>`).join(' ')} — you've onboarded but haven't picked any game roles yet! Grab some from <#${this.roleSelectionChannelId}> so the channels for the games you play show up.`,
      allowedMentions: { users: batch.map(member => member.id) },
    });

    const recorded = await this.recordNudges(batch);

    const summary = recorded
      ? `Nudged ${batch.length} member(s) in <#${this.chitChatChannel.id}>: ${names}. ${waiting} still waiting.`
      : `⚠️ Nudged ${batch.length} member(s) (${names}) but failed to record it, so they are due to be nudged again.${this.consecutiveFailures >= this.maxConsecutiveFailures ? ' Standing the job down until the bot restarts.' : ''}`;

    await this.log(summary);

    return summary;
  }

  async findCandidates(): Promise<GuildMember[]> {
    const guild = await this.discordService.getGuild(this.guildId);
    const roles = await this.discordService.getAllRolesFromGuild(guild);

    // Discord allows duplicate role names, and picking one at random decides who gets contacted
    const onboardedRoles = roles.filter(role => role.name === this.onboardedRoleName);

    if (onboardedRoles.size !== 1) {
      throw new Error(`Expected exactly one "${this.onboardedRoleName}" role in the guild, found ${onboardedRoles.size}`);
    }

    const onboardedRoleId = onboardedRoles.first().id;
    const members = await guild.members.fetch();
    const joinedBefore = generateDateInPast(this.graceDays);

    const eligible = members.filter(member => {
      if (member.user?.bot) {
        return false;
      }

      // @everyone shares the guild's ID and is in every member's cache, so it never counts
      // as a role anyone chose.
      const chosenRoles = member.roles.cache.filter(role => role.id !== guild.id);

      if (chosenRoles.size !== 1 || !chosenRoles.has(onboardedRoleId)) {
        return false;
      }

      // No join date means Discord gave us a partial member. Better to skip them this run
      // than to nudge someone who may have arrived minutes ago.
      return !!member.joinedAt && member.joinedAt < joinedBefore;
    });

    if (eligible.size === 0) {
      return [];
    }

    const nudged = await this.nudgeRepository.find({ discordId: { $in: [...eligible.keys()] } });
    const nudgedIds = new Set(nudged.map(row => row.discordId));

    // Longest waiting first, so a backlog drains in join order rather than Discord's cache
    // order, and the same people don't sit at the front of every run.
    return [...eligible.values()]
      .filter(member => !nudgedIds.has(member.id))
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
  }

  // One statement, so a duplicate key can never leave half a batch recorded and the other half
  // due for a second public ping.
  private async recordNudges(members: GuildMember[]): Promise<boolean> {
    const now = new Date();
    const values = members.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const params = members.flatMap(member => [member.id, member.displayName, now, now, now]);

    try {
      await this.nudgeRepository.getEntityManager().getConnection().execute(
        `insert into onboarding_nudge_entity (discord_id, discord_nickname, nudged_at, created_at, updated_at)
         values ${values}
         on duplicate key update updated_at = values(updated_at)`,
        params,
      );
      this.consecutiveFailures = 0;
      return true;
    }
    catch (err) {
      this.consecutiveFailures++;
      this.logger.error(`Failed to record ${members.length} nudge(s): ${err.message}`);
      return false;
    }
  }

  // Names only, never mentions - the audit log must not re-ping everyone it names
  private async log(content: string): Promise<void> {
    try {
      await this.botJobsChannel.send({ content, allowedMentions: { users: [] } });
    }
    catch (err) {
      this.logger.error(`Failed to log the onboarding nudge run to bot jobs: ${err.message}`);
    }
  }
}
