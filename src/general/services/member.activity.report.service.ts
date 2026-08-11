import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, User } from 'discord.js';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { GameTotal, MemberActivityRollupService } from './member.activity.rollup.service';
import { MemberDailyActivityEntity } from '../../database/entities/member.daily.activity.entity';
import { activityBand, discordTime, friendlyDuration, hoursPerDay, utcMidnight } from '../../helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_WINDOW_DAYS = 14;
const MAX_GAMES_LISTED = 10;
// Discord rejects a message over 2000 characters outright, and game names run to 128 each
const REPORT_CHAR_BUDGET = 1900;

const GAME_FOOTNOTE = [
  '-# Game time is sampled from Discord presence — it only counts when the member has Discord open with game activity sharing enabled, so a low figure may reflect settings rather than inactivity.',
];

const isActiveDay = (row: MemberDailyActivityEntity): boolean =>
  row.messagesSent > 0 || row.reactionsAdded > 0 || row.voiceMinutes > 0;

@Injectable()
export class MemberActivityReportService {
  private readonly logger = new Logger(MemberActivityReportService.name);

  constructor(
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
    private readonly rollupService: MemberActivityRollupService,
  ) {}

  // Two messages, not one: the summary and the game list each have their own 2000 character
  // budget, so a member with a long game list can't cost them their activity figures.
  async buildReport(user: User, member: GuildMember | null): Promise<string[]> {
    const discordId = user.id;
    this.logger.log(`Building activity report for ${discordId}`);

    const record = await this.activityRepository.findOne({ discordId });
    const trackingStart = await this.rollupService.getTrackingStartDate();
    const joinedAt = member?.joinedAt ?? null;

    // Figures are only meaningful from the later of "tracking existed" and "they were here".
    // Measuring from tracking start alone would score a recent joiner against days they missed.
    const since = this.windowStart(trackingStart, joinedAt);

    const rollup = await this.rollupService.getRollup(discordId, since);
    const gameTotals = await this.rollupService.getGameTotals(discordId, since);
    const trackedDays = Math.max(1, Math.ceil((Date.now() - since.getTime()) / DAY_MS));

    const summary = [
      `# 📊 Activity Report: ${member?.displayName ?? user.username}`,
      `<@${discordId}>`,
      '',
      ...this.overviewLines(record, rollup, member),
      '',
      ...this.engagementLines(rollup, trackedDays),
      '',
      ...this.summaryFootnotes(trackingStart, since, trackedDays, joinedAt),
    ].join('\n');

    return [summary, this.gamesMessage(gameTotals)];
  }

  // Trims the list until it fits rather than letting Discord reject the message. Names run to
  // 128 characters each, so ten of them is well over the limit on its own.
  private gamesMessage(gameTotals: GameTotal[]): string {
    for (let listed = MAX_GAMES_LISTED; listed > 0; listed--) {
      const message = this.gameLines(gameTotals, listed).join('\n');

      if (message.length <= REPORT_CHAR_BUDGET) {
        return message;
      }
    }

    return this.gameLines(gameTotals, 0).join('\n');
  }

  windowStart(trackingStart: Date | null, joinedAt: Date | null): Date {
    const anchor = trackingStart ?? utcMidnight();
    return joinedAt && joinedAt > anchor ? utcMidnight(joinedAt) : anchor;
  }

  private overviewLines(
    record: ActivityEntity | null,
    rollup: MemberDailyActivityEntity[],
    member: GuildMember | null,
  ): string[] {
    const lines = ['### Overview'];

    if (member?.joinedAt) {
      const joinedDays = Math.floor((Date.now() - member.joinedAt.getTime()) / DAY_MS);
      lines.push(`- 📅 Joined the server: ${discordTime(member.joinedAt, 'D')} — **${joinedDays}** day${joinedDays === 1 ? '' : 's'} ago`);
    }
    else {
      lines.push('- 📅 Not currently a member of this server.');
    }

    lines.push(this.lastSeenLine(record, rollup));

    return lines;
  }

  // The live record is deleted on guildMemberRemove, so a leaver with plenty of rollup history
  // has no record at all. Saying "never recorded" there would contradict the figures below it.
  private lastSeenLine(record: ActivityEntity | null, rollup: MemberDailyActivityEntity[]): string {
    if (record) {
      return `- 👀 Last seen: ${discordTime(record.lastActivity, 'R')} (${discordTime(record.lastActivity, 'f')})`;
    }

    const lastActiveDay = rollup
      .filter(isActiveDay)
      .reduce<Date | null>((latest, row) => !latest || row.date > latest ? row.date : latest, null);

    if (lastActiveDay) {
      return `- 👀 Last seen: on or around ${discordTime(lastActiveDay, 'D')} — there is no live record for them, which is normal once a member has left the server.`;
    }

    return '- 👀 Last seen: **never recorded** — no messages, reactions or voice have been seen from them.';
  }

  private engagementLines(rollup: MemberDailyActivityEntity[], trackedDays: number): string[] {
    const lines = ['### Engagement'];

    if (rollup.length === 0) {
      lines.push('📭 **Nothing recorded in this window.** They may have been quiet, or simply predate what has been tracked.');
      return lines;
    }

    const messages = rollup.reduce((total, row) => total + row.messagesSent, 0);
    const reactions = rollup.reduce((total, row) => total + row.reactionsAdded, 0);
    const voiceMinutes = rollup.reduce((total, row) => total + row.voiceMinutes, 0);

    const activeDays = rollup.filter(isActiveDay).length;

    // Filtered from the rows already fetched rather than queried again
    const recentFrom = Date.now() - RECENT_WINDOW_DAYS * DAY_MS;
    const recentActiveDays = rollup.filter((row) => row.date.getTime() >= recentFrom && isActiveDay(row)).length;

    lines.push(
      `- 💬 Messages: **${messages}** (${(messages / trackedDays).toFixed(1)}/day)`,
      `- ⭐ Reactions: **${reactions}**`,
      `- 🎙️ Voice: **${friendlyDuration(voiceMinutes)}** (${hoursPerDay(voiceMinutes, trackedDays)})`,
      this.activityLine('📊 Active days all time', activeDays, trackedDays),
      this.activityLine(`📈 Active days last ${RECENT_WINDOW_DAYS}`, recentActiveDays, Math.min(RECENT_WINDOW_DAYS, trackedDays)),
    );

    return lines;
  }

  private gameLines(gameTotals: GameTotal[], maxListed: number): string[] {
    const lines = ['### 🎮 Game Activity'];

    if (gameTotals.length === 0) {
      lines.push('📭 **No game activity recorded.**', ...GAME_FOOTNOTE);
      return lines;
    }

    const totalMinutes = gameTotals.reduce((total, game) => total + game.minutes, 0);
    const listed = gameTotals.slice(0, maxListed);
    const share = (minutes: number) => totalMinutes > 0 ? ` (${((minutes / totalMinutes) * 100).toFixed(0)}%)` : '';

    lines.push(`- 🕹️ Total tracked game time: **${friendlyDuration(totalMinutes)}** across **${gameTotals.length}** game${gameTotals.length === 1 ? '' : 's'}`);
    lines.push(...listed.map((game) => `  - **${game.gameName}** — ${friendlyDuration(game.minutes)}${share(game.minutes)}`));

    const remaining = gameTotals.slice(maxListed);

    // Counted, never named - the tail exists to keep the message inside Discord's limit,
    // and listing the names is the thing that broke the limit in the first place.
    if (remaining.length > 0 && listed.length > 0) {
      const remainingMinutes = remaining.reduce((total, game) => total + game.minutes, 0);
      lines.push(`  - …and **${remaining.length}** other${remaining.length === 1 ? '' : 's'} totalling ${friendlyDuration(remainingMinutes)}`);
    }

    lines.push(...GAME_FOOTNOTE);

    return lines;
  }

  private summaryFootnotes(trackingStart: Date | null, since: Date, trackedDays: number, joinedAt: Date | null): string[] {
    const lines: string[] = [];

    if (!trackingStart) {
      lines.push('-# Activity tracking has not recorded anything yet, for anyone.');
    }
    else {
      const anchor = joinedAt && since.getTime() > trackingStart.getTime() ? 'they joined the server' : 'tracking began';
      lines.push(`-# Figures cover the ${trackedDays} day${trackedDays === 1 ? '' : 's'} since ${anchor} (${discordTime(since, 'D')}).`);
    }

    lines.push('-# Messages, reactions and voice are counted across all channels, not filtered to one game section.');

    return lines;
  }

  activityLine(label: string, activeDays: number, trackedDays: number): string {
    const days = Math.max(1, trackedDays);
    const percent = ((activeDays / days) * 100).toFixed(0);

    return `- ${label}: **${activeDays}** of **${days}** days (${percent}%) — ${activityBand(activeDays, days)}`;
  }
}
