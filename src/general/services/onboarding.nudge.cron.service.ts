import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, Message, TextChannel } from 'discord.js';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { DiscordService } from '../../discord/discord.service';
import { OnboardingNudgeEntity } from '../../database/entities/onboarding.nudge.entity';
import { discordTime, generateDateInPast } from '../../helpers';

// Discord's hard limit is 2000; the headroom absorbs a long display name on the final line
const MAX_MESSAGE_LENGTH = 1900;
// A backlog of hundreds would otherwise bury the channel in follow-ups
const MAX_REPORT_MESSAGES = 4;
// Discord's allowedMentions list tops out at 100 users; well under it keeps a ping block readable
const MAX_MENTIONS_PER_MESSAGE = 25;

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
  private welcomeChannel: TextChannel;
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
    const welcomeId = this.config.get('discord.channels.welcome');
    const botJobsId = this.config.get('discord.channels.botJobs');
    this.roleSelectionChannelId = this.config.get('discord.channels.roleSelection');

    const missing = [
      ['GUILD_ID_WITH_COMMANDS', this.guildId],
      ['CHANNEL_WELCOME', welcomeId],
      ['CHANNEL_BOT_JOBS', botJobsId],
      ['CHANNEL_ROLES', this.roleSelectionChannelId],
    ].filter(([, value]) => !value).map(([name]) => name);

    if (missing.length > 0) {
      this.logger.error(`Onboarding nudge job disabled, missing config: ${missing.join(', ')}`);
      return;
    }

    try {
      this.welcomeChannel = await this.discordService.getTextChannel(welcomeId);
      this.botJobsChannel = await this.discordService.getTextChannel(botJobsId);
    }
    catch (err) {
      this.logger.error(`Onboarding nudge job disabled, could not resolve its channels: ${err.message}`);
      return;
    }

    if (!this.welcomeChannel?.isTextBased() || !this.botJobsChannel?.isTextBased()) {
      this.logger.error('Onboarding nudge job disabled, CHANNEL_WELCOME or CHANNEL_BOT_JOBS is not a text channel');
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

    try {
      // A live run only ever produces the one summary line
      this.logger.log((await this.run()).join('\n'));
    }
    catch (err) {
      this.logger.error(`Onboarding nudge run failed: ${err.message}`);
      await this.log(`⛔️ Onboarding nudge run failed: ${err.message}`);
    }
  }

  // Both guards live here rather than in the cron so a manual run can't overlap a scheduled one,
  // or hand-restart the ping loop the job stood down to avoid. A dry run posts nothing, so it
  // stays available for working out why.
  // Returns one message per Discord send - a dry run's roster can outrun the 2000 character limit.
  // `all` clears the whole backlog in one go instead of draining it five every three hours, which
  // for a first run against a real backlog would otherwise take days.
  async run(dryRun = false, all = false): Promise<string[]> {
    if (!dryRun && this.consecutiveFailures >= this.maxConsecutiveFailures) {
      return ['🛑 The onboarding nudge job has stood down after repeatedly failing to record nudges. Restart the bot once the database is healthy.'];
    }

    if (this.isRunning) {
      return ['⏳ An onboarding nudge run is already in progress, skipping this one.'];
    }

    this.isRunning = true;

    try {
      return await this.execute(dryRun, all);
    }
    finally {
      this.isRunning = false;
    }
  }

  private async execute(dryRun: boolean, all: boolean): Promise<string[]> {
    if (!this.enabled) {
      throw new Error('The onboarding nudge job is not configured. Check CHANNEL_WELCOME, CHANNEL_BOT_JOBS and CHANNEL_ROLES are set.');
    }

    const candidates = await this.findCandidates();

    if (candidates.length === 0) {
      return ['No members are sat on only the Onboarded role right now.'];
    }

    const targets = all ? candidates : candidates.slice(0, this.maxPerRun);
    const groups = this.groupForSending(targets);

    if (dryRun) {
      return this.buildDryRunReport(candidates, targets, groups.length);
    }

    const sent: GuildMember[] = [];
    const links: string[] = [];
    let recorded = 0;
    let halted = '';

    for (const group of groups) {
      let posted: Message;

      try {
        // The allowlist is explicit so a later edit to the wording can't turn this into a role
        // or @everyone ping in a public channel.
        posted = await this.welcomeChannel.send({
          content: this.nudgeMessage(group),
          allowedMentions: { users: group.map(member => member.id) },
        });
      }
      catch (err) {
        halted = `Discord refused the message: ${err.message}`;
        break;
      }

      sent.push(...group);

      if (posted?.url) {
        links.push(posted.url);
      }

      // Stop rather than keep pinging into a database that can't remember it happened - the
      // whole backlog would otherwise be nudged again on the next run.
      if (!await this.recordNudges(group)) {
        halted = 'the nudge could not be recorded';
        break;
      }

      recorded += group.length;
    }

    const summary = this.summarise(candidates.length, sent, recorded, groups.length, halted);
    const report = this.paginate(summary, this.nudgedRoster(sent, links));

    // Sent in order rather than in parallel, so a split roster reads top to bottom in the channel
    for (const page of report) {
      await this.log(page);
    }

    return report;
  }

  // The people who need to know this ran keep the welcome channel muted, so bot jobs carries the
  // whole roster and a way back to the post rather than a bare count they'd have to go and check.
  private nudgedRoster(sent: GuildMember[], links: string[]): string[] {
    if (sent.length === 0) {
      return [];
    }

    return [
      '',
      ...sent.map(member => this.describe(member)),
      ...this.jumpLine(links),
    ];
  }

  // Nothing to link to when Discord handed back no message, which is every path that failed to send
  private jumpLine(links: string[]): string[] {
    if (links.length === 0) {
      return [];
    }

    return links.length === 1
      ? ['', `[Jump to the post](${links[0]})`]
      : ['', `Jump to the posts: ${links.map((link, index) => `[${index + 1}](${link})`).join(' ')}`];
  }

  private nudgeMessage(members: GuildMember[]): string {
    return `👋 ${members.map(member => `<@${member.id}>`).join(' ')} — you've onboarded but haven't picked any game roles yet! Grab some from <#${this.roleSelectionChannelId}> so the channels for the games you play show up, and you get to hear when people are playing!\n\nYou can opt out at any time should the pings become annoying by un-reacting from the role. We ask you do this before muting the server.\n\nThis is a one time notification.`;
  }

  // A whole backlog cannot go in one message - Discord caps a message at 2000 characters and
  // allowedMentions at 100 users, and silently dropping either end would leave members pinged
  // in the copy but not notified, or recorded as nudged without being named.
  private groupForSending(members: GuildMember[]): GuildMember[][] {
    const groups: GuildMember[][] = [];
    let current: GuildMember[] = [];

    for (const member of members) {
      const next = [...current, member];

      if (current.length > 0 && (next.length > MAX_MENTIONS_PER_MESSAGE || this.nudgeMessage(next).length > MAX_MESSAGE_LENGTH)) {
        groups.push(current);
        current = [member];
        continue;
      }

      current = next;
    }

    if (current.length > 0) {
      groups.push(current);
    }

    return groups;
  }

  private summarise(eligible: number, sent: GuildMember[], recorded: number, groups: number, halted: string): string {
    if (halted) {
      return `⚠️ Nudged ${sent.length} of ${eligible} member(s) and stopped because ${halted}. ${sent.length - recorded} of those failed to record it, so they are due to be nudged again.${this.consecutiveFailures >= this.maxConsecutiveFailures ? ' Standing the job down until the bot restarts.' : ''}`;
    }

    const across = groups > 1 ? ` across ${groups} messages` : '';

    // Who was nudged is listed underneath, so the summary line stays a headline
    return `Nudged ${sent.length} member(s) in <#${this.welcomeChannel.id}>${across}. ${eligible - sent.length} still waiting.`;
  }

  // Plain names and IDs, never mentions - a report of who has or hasn't picked roles must not
  // become the nudge itself, and it is read in a staff channel where pinging them would be noise.
  private describe(member: GuildMember): string {
    return `- **${member.displayName}** (\`${member.id}\`) — joined ${discordTime(member.joinedAt, 'R')}`;
  }

  private buildDryRunReport(candidates: GuildMember[], targets: GuildMember[], groups: number): string[] {
    const waiting = candidates.length - targets.length;
    const across = groups > 1 ? ` across ${groups} messages` : '';
    const header = `**[DRY RUN]** ${candidates.length} member(s) are sat on only the Onboarded role. Nothing has been posted.`;

    // With the whole backlog in the batch the two sections would be the same list printed twice
    const lines = waiting === 0
      ? [
        '',
        `**All ${targets.length} would be nudged now${across}**, longest waiting first:`,
        ...targets.map(member => this.describe(member)),
      ]
      : [
        '',
        `**Would be nudged now (${targets.length}${across}, ${waiting} left over):**`,
        ...targets.map(member => this.describe(member)),
        '',
        `**Everyone eligible (${candidates.length}), longest waiting first:**`,
        ...candidates.map(member => this.describe(member)),
      ];

    return this.paginate(header, lines);
  }

  // Discord caps a message at 2000 characters, and a first run against a real backlog will blow
  // through that. Splits across messages, and says so rather than silently dropping the tail.
  private paginate(header: string, lines: string[]): string[] {
    const messages: string[] = [];
    let current = header;

    for (const [index, line] of lines.entries()) {
      if (current.length + line.length + 1 <= MAX_MESSAGE_LENGTH) {
        current = `${current}\n${line}`;
        continue;
      }

      messages.push(current);

      if (messages.length === MAX_REPORT_MESSAGES) {
        return [...messages.slice(0, -1), `${messages.at(-1)}\n…and ${lines.length - index} more lines not shown.`];
      }

      current = line;
    }

    return [...messages, current];
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
