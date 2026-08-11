import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository, UniqueConstraintViolationException } from '@mikro-orm/core';
import { GuildMember, TextChannel } from 'discord.js';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import {
  AlbionRankUpVoteEntity,
  AlbionRankUpVoteStatus,
} from '../../database/entities/albion.rank.up.vote.entity';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { DiscordService } from '../../discord/discord.service';
import { MemberActivityRollupService } from '../../general/services/member.activity.rollup.service';
import { LeadershipPing } from '../../config/albion.app.config';
import {
  majorityScore,
  PROVISIONAL_HOLD_MS,
  scoreHeading,
  UNANIMOUS_HOLD_SECONDS,
  UNPOSTED_GRACE_MS,
  VOTE_REACTIONS,
} from './albion.ballot.text';
import { activityBand, discordTime, friendlyDuration, hoursPerDay } from '../../helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const DENIAL_NOTICE_THROTTLE_HOURS = 24;

// How long a member waits after a vote goes against them before they may ask again.
// Keyed off the vote's outcome, not the request, so it can never delay a first attempt.
const FAILED_VOTE_LOCKOUT_DAYS = 7;

// Outcomes that start the lockout. ABANDONED is excluded deliberately - the ballot vanished or
// could not be posted, which is our problem rather than the candidate's.
const LOCKOUT_STATUSES = [
  AlbionRankUpVoteStatus.FAILED,
  AlbionRankUpVoteStatus.TIMED_OUT,
  AlbionRankUpVoteStatus.VETOED,
];
const VOTE_DURATION_DAYS = 5;

// A second, recent window alongside the all-time one. Someone active for a year but absent for the
// last fortnight and someone who just arrived read identically on a lifetime average.
const RECENT_WINDOW_DAYS = 14;

// Stated on the ballot, so it is read from the hold itself rather than written down twice
const HOLD_HOURS = Math.round(PROVISIONAL_HOLD_MS / (60 * 60 * 1000));
const MAX_CHARACTER_NAME = 32;

export enum RankUpRefusal {
  NOT_REGISTERED = 'NOT_REGISTERED',
  RANK_NOT_ELIGIBLE = 'RANK_NOT_ELIGIBLE',
  TOO_NEW = 'TOO_NEW',
  RECENT_FAILED_VOTE = 'RECENT_FAILED_VOTE',
  NO_GRADUATE_DATE = 'NO_GRADUATE_DATE',
  VOTE_ALREADY_OPEN = 'VOTE_ALREADY_OPEN',
  NO_ELECTORATE = 'NO_ELECTORATE',
}

interface Tier {
  from: string;
  to: string;
  windowDays: number;
}

// Only member-initiated tiers. Eldritch Mage and above are offered by leadership.
const TIERS: Record<number, Tier> = {
  6: { from: '@ALB/Disciple', to: '@ALB/Graduate', windowDays: 14 },
  5: { from: '@ALB/Graduate', to: '@ALB/Adept', windowDays: 28 },
};

export interface RankUpOutcome {
  ok: boolean;
  reply: string;
}

@Injectable()
export class AlbionRankUpService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRankUpService.name);
  private judgementHall: TextChannel;
  private readonly unregisteredNotices = new Map<string, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    private readonly albionUtilities: AlbionUtilities,
    private readonly rollupService: MemberActivityRollupService,
    @InjectRepository(AlbionRegistrationsEntity) private readonly registrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
    @InjectRepository(AlbionRankUpVoteEntity) private readonly voteRepository: EntityRepository<AlbionRankUpVoteEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const channelId = this.config.get('discord.channels.judgementHall');

    // Checked before the fetch, which otherwise fails with "undefined is not a snowflake" -
    // a Discord error for what is really a missing environment variable
    if (!channelId) {
      throw new Error('CHANNEL_ALBION_JUDGEMENT_HALL is not set, so rank up ballots cannot be posted');
    }

    const channel = await this.discordService.getTextChannel(channelId);

    if (!channel) {
      throw new Error(`Could not find the Judgement Hall channel with ID ${channelId}`);
    }
    if (!channel.isTextBased()) {
      throw new Error(`Judgement Hall channel with ID ${channelId} is not a text channel`);
    }

    this.judgementHall = channel;
  }

  async handleRankUpRequest(member: GuildMember): Promise<RankUpOutcome> {
    // A failed bootstrap only logs - Nest carries on booting - so without this every refusal is
    // silently swallowed and every ballot dies on a TypeError deep inside publish()
    if (!this.judgementHall) {
      this.logger.error('Rank up requested but the Judgement Hall channel was never resolved at boot');
      return {
        ok: false,
        reply: '⛔ Rank up requests are unavailable right now — the vote channel is not configured. Please tell leadership.',
      };
    }

    const guildId = this.config.get('albion.guildId');

    // Registration first, so an unregistered member holding a rank role still gets
    // the right answer
    const registration = await this.registrationsRepository.findOne({ guildId, discordId: member.id });

    if (!registration) {
      return await this.refuse(member, null, null, RankUpRefusal.NOT_REGISTERED);
    }

    const currentRole = this.albionUtilities.getHighestAlbionRole(member);
    const tier = currentRole ? TIERS[currentRole.priority] : undefined;

    if (!tier) {
      return await this.refuse(member, registration, null, RankUpRefusal.RANK_NOT_ELIGIBLE);
    }

    // Never fall back to the registration date. Someone who registered months ago but only just
    // became a Graduate would clear the 28 day gate instantly, which is what it exists to stop.
    const anchor = tier.to === '@ALB/Adept' ? registration.graduateSince : registration.createdAt;

    if (!anchor) {
      return await this.refuse(member, registration, tier, RankUpRefusal.NO_GRADUATE_DATE);
    }

    const eligibleAt = new Date(anchor.getTime() + tier.windowDays * DAY_MS);

    if (eligibleAt > new Date()) {
      return await this.refuse(member, registration, tier, RankUpRefusal.TOO_NEW, eligibleAt);
    }

    // A vote that went against them locks them out for a week. Checked after the time gate so a
    // newcomer always gets the more useful "not long enough yet" answer, and keyed off the vote's
    // resolution rather than the request, so it can never delay a first attempt.
    const lockoutUntil = await this.failedVoteLockout(member.id);

    if (lockoutUntil) {
      return await this.refuse(member, registration, tier, RankUpRefusal.RECENT_FAILED_VOTE, lockoutUntil);
    }

    return await this.publish(member, registration, tier);
  }

  // Returns when they may ask again, or null if nothing is holding them back
  async failedVoteLockout(discordId: string): Promise<Date | null> {
    const since = new Date(Date.now() - FAILED_VOTE_LOCKOUT_DAYS * DAY_MS);

    const lastFailure = await this.voteRepository.findOne(
      {
        discordId,
        status: { $in: LOCKOUT_STATUSES },
        resolvedAt: { $gte: since },
      },
      { orderBy: { resolvedAt: 'DESC' } },
    );

    if (!lastFailure?.resolvedAt) {
      return null;
    }

    return new Date(lastFailure.resolvedAt.getTime() + FAILED_VOTE_LOCKOUT_DAYS * DAY_MS);
  }

  private async publish(
    member: GuildMember,
    registration: AlbionRegistrationsEntity,
    tier: Tier,
  ): Promise<RankUpOutcome> {
    const electors = await this.albionUtilities.getElectors(member.guild);

    // An empty electorate would set the bar at half a point, which a single shrug clears.
    // That's a configuration fault, not a vote.
    if (electors.length === 0) {
      this.logger.error('Refusing to open a rank up ballot: no electors found in the guild');
      return await this.refuse(member, registration, tier, RankUpRefusal.NO_ELECTORATE);
    }

    const requiredScore = majorityScore(electors.length);
    const expiresAt = new Date(Date.now() + VOTE_DURATION_DAYS * DAY_MS);
    const characterName = registration.characterName.slice(0, MAX_CHARACTER_NAME);

    const ping: LeadershipPing = this.config.get('albion.leadershipPing');

    const newBallot = () => new AlbionRankUpVoteEntity({
      channelId: this.judgementHall.id,
      discordId: member.id,
      pendingKey: member.id, // Unique, so the database rejects a second open ballot
      characterName,
      fromRank: tier.from,
      toRank: tier.to,
      requiredScore,
      electorateSize: electors.length,
      expiresAt,
    });

    // Rendered before the row is claimed. Anything failing in here afterwards would strand a
    // pending ballot with no message, locking the member out of a vote nobody could ever see.
    const content = await this.renderBallot(newBallot(), scoreHeading(0, requiredScore));

    // The row goes in before the Discord post. Posting first means a flush failure leaves a
    // public ballot nothing tracks and nothing will ever resolve.
    let vote: AlbionRankUpVoteEntity;

    try {
      vote = await this.claimBallot(newBallot);
    }
    catch (err) {
      if (!(err instanceof UniqueConstraintViolationException)) {
        // Anything that isn't the duplicate guard is a fault, not a member doing something wrong
        this.logger.error(`Could not open a rank up ballot for ${member.id}: ${err.message}`);
        return { ok: false, reply: '⛔ Something went wrong opening your rank up request. Please tell leadership.' };
      }

      this.logger.warn(`Refused a duplicate rank up ballot for ${member.id}: ${err.message}`);
      return await this.refuse(member, registration, tier, RankUpRefusal.VOTE_ALREADY_OPEN);
    }

    let message: Awaited<ReturnType<TextChannel['send']>>;

    try {
      message = await this.judgementHall.send({
        content,
        allowedMentions: { roles: ping.roles, users: [...ping.users, member.id] },
      });
    }
    catch (err) {
      this.logger.error(`Failed to post rank up ballot for ${member.id}: ${err.message}`);

      // Don't lock the member out behind a ballot that never went up. The cleanup gets its own
      // guard because a failure here would escape and strand the claim it exists to release.
      try {
        vote.status = AlbionRankUpVoteStatus.ABANDONED;
        vote.pendingKey = null;
        vote.resolutionNote = 'The ballot could not be posted';
        await this.voteRepository.getEntityManager().persist(vote).flush();
      }
      catch (cleanupErr) {
        // The sweep will reclaim it, so this costs the member a wait rather than a lockout
        this.logger.error(`Could not release the claim for ${member.id}: ${cleanupErr.message}`);
      }

      return { ok: false, reply: '⛔ Could not post your rank up request. Please tell leadership.' };
    }

    if (!await this.trackBallot(vote, message.id)) {
      // The sweep reclaimed the claim while the send was in flight, so this ballot is an orphan
      // nothing will ever resolve. Take it down rather than leave leadership voting on it.
      this.logger.error(`Ballot ${message.id} for ${member.id} was reclaimed mid-post, removing it`);

      try {
        await message.delete();
      }
      catch (err) {
        this.logger.error(`Could not remove orphaned ballot ${message.id}: ${err.message}`);
      }

      return { ok: false, reply: '⛔ Your rank up request could not be opened. Please try again.' };
    }

    for (const emoji of VOTE_REACTIONS) {
      try {
        await message.react(emoji);
      }
      catch (err) {
        // Cosmetic - leadership can add it by hand. Must not roll anything back.
        this.logger.warn(`Could not add ${emoji} to ballot ${message.id}: ${err.message}`);
      }
    }

    return {
      ok: true,
      reply: `✅ Your rank up request has been sent to <#${this.judgementHall.id}>. Leadership will vote on it, and voting closes ${discordTime(expiresAt, 'R')}.`,
    };
  }

  // Conditional, because the reclaim sweep can decide a ballot is never going to appear while the
  // send is still in flight. Losing that race means our post is an orphan, so the caller has to
  // know rather than write a message ID onto a row somebody else already abandoned.
  private async trackBallot(vote: AlbionRankUpVoteEntity, messageId: string): Promise<boolean> {
    try {
      const result = await this.voteRepository.getEntityManager().getConnection().execute(
        `update albion_rank_up_vote_entity set message_id = ?, updated_at = ?
          where id = ? and status = ? and message_id is null`,
        [messageId, new Date(), vote.id, AlbionRankUpVoteStatus.PENDING],
        'run',
      );

      return this.affectedRows(result) === 1;
    }
    catch (err) {
      // Can't tell whether we still own it, and taking down a ballot leadership may already be
      // voting on is the worse mistake. Leave it up and shout.
      this.logger.error(`Rank up ballot ${messageId} is public but could not be tracked: ${err.message}`);
      return true;
    }
  }

  private affectedRows(result: unknown): number {
    if (typeof result === 'number') {
      return result;
    }

    return (result as { affectedRows?: number })?.affectedRows ?? 0;
  }

  // A pending row with no messageId is a ballot that was never posted: the insert claimed the
  // member's slot and something failed before the send. Nothing else ever clears it, so the member
  // stays locked out and is eventually timed out for a vote nobody could see.
  // announcedAt is stamped alongside resolvedAt so the reconcile sweep doesn't try to post an
  // outcome for a message that never existed.
  async reclaimUnposted(discordId?: string): Promise<number> {
    const connection = this.voteRepository.getEntityManager().getConnection();
    const now = new Date();
    const cutoff = new Date(Date.now() - UNPOSTED_GRACE_MS);

    const result = await connection.execute(
      `update albion_rank_up_vote_entity
          set status = ?, pending_key = null, resolved_at = ?, announced_at = ?,
              resolution_note = ?, updated_at = ?
        where status = ? and message_id is null and created_at <= ?
          ${discordId ? 'and discord_id = ?' : ''}`,
      [
        AlbionRankUpVoteStatus.ABANDONED, now, now,
        'The ballot was never posted', now,
        AlbionRankUpVoteStatus.PENDING, cutoff,
        ...(discordId ? [discordId] : []),
      ],
      'run',
    );

    const reclaimed = this.affectedRows(result);

    if (reclaimed > 0) {
      this.logger.warn(`Reclaimed ${reclaimed} rank up ballot(s) that were never posted`);
    }

    return reclaimed;
  }

  // A unique violation can mean a live ballot, or a stranded claim from an attempt that died
  // before it posted. Clearing the latter is the difference between a retry and a lockout.
  private async claimBallot(newBallot: () => AlbionRankUpVoteEntity): Promise<AlbionRankUpVoteEntity> {
    const ballot = newBallot();

    try {
      await this.voteRepository.getEntityManager().persist(ballot).flush();
      return ballot;
    }
    catch (err) {
      if (!(err instanceof UniqueConstraintViolationException)) {
        throw err;
      }

      if (await this.reclaimUnposted(ballot.discordId) === 0) {
        throw err;
      }

      // Safe to reuse the entity manager: MikroORM drops the failed entity from the persist
      // stack, so this flush inserts only the replacement. Verified against the container.
      const retry = newBallot();
      await this.voteRepository.getEntityManager().persist(retry).flush();
      return retry;
    }
  }

  // Renders the whole ballot from the row, so a live vote can be re-rendered onto the current
  // wording rather than being frozen in whatever format it was posted under. Everything it needs
  // is either on the row or re-read here, which is why it takes no other arguments.
  async renderBallot(vote: AlbionRankUpVoteEntity, scoreLine: string): Promise<string> {
    const ping: LeadershipPing = this.config.get('albion.leadershipPing');
    const registration = await this.registrationsRepository.findOne({
      guildId: this.config.get('albion.guildId'),
      discordId: vote.discordId,
    });
    const { electorateSize, requiredScore, expiresAt } = vote;

    // Deregistered mid vote: the ballot still has to render, just without the history
    const stats = registration
      ? await this.buildActivityBlock(vote, registration)
      : '### Metrics\n📭 **This member is no longer registered with the Albion guild.**';

    return `${ping.mention}

Guildmember **${vote.characterName}** (<@${vote.discordId}>) wants to be ranked up from **${this.friendlyRank(vote.fromRank)}** to **${this.friendlyRank(vote.toRank)}**.
Please react with the following:

- 👍 to approve the rank up
- 🤷 to say "I don't know the person well enough"
- 👎 to disapprove the rank up
- ⛔ veto the rank up (this action needs justification with proof), this will cause the vote to fail within ${HOLD_HOURS} hour${HOLD_HOURS === 1 ? '' : 's'}.

Scoring: 👍 = 1 point · 🤷 = 0.5 points · 👎 = 0 points

Eligible voters: ${electorateSize}
Passes at a score of **${requiredScore}** — a majority of ${electorateSize} (${electorateSize} ÷ 2 = ${electorateSize / 2}) + 0.5
Voting closes ${discordTime(expiresAt, 'R')}

-# Every outcome, a veto included, is held for ${HOLD_HOURS} hour${HOLD_HOURS === 1 ? '' : 's'} before it locks in. Lift a veto inside that window and the vote carries on.
-# The exception is a clean sweep: 👍 from all ${electorateSize} of you and it locks in after ${UNANIMOUS_HOLD_SECONDS} seconds, since there is nobody left to object.

${scoreLine}

${stats}`;
  }

  private async buildActivityBlock(
    vote: AlbionRankUpVoteEntity,
    registration: AlbionRegistrationsEntity,
  ): Promise<string> {
    // The window the figures cover. Tier 2 measures from the graduate date, tier 1 from
    // registration - the same anchor the eligibility gate used.
    const anchor = (vote.toRank === '@ALB/Adept' ? registration.graduateSince : registration.createdAt)
      ?? registration.createdAt;
    const discordId = vote.discordId;
    const trackingStart = await this.rollupService.getTrackingStartDate();
    const since = trackingStart && trackingStart > anchor ? trackingStart : anchor;

    const rollup = await this.rollupService.getRollup(discordId, since);
    const gameTotals = await this.rollupService.getGameTotals(discordId, since);

    const messages = rollup.reduce((total, row) => total + row.messagesSent, 0);
    const reactions = rollup.reduce((total, row) => total + row.reactionsAdded, 0);
    const voiceMinutes = rollup.reduce((total, row) => total + row.voiceMinutes, 0);
    const isActive = (row: { messagesSent: number, reactionsAdded: number, voiceMinutes: number }) =>
      row.messagesSent > 0 || row.reactionsAdded > 0 || row.voiceMinutes > 0;

    const activeDays = rollup.filter(isActive).length;

    // Filtered from the rows already fetched rather than queried again
    const recentFrom = Date.now() - RECENT_WINDOW_DAYS * DAY_MS;
    const recentActiveDays = rollup.filter((row) => row.date.getTime() >= recentFrom && isActive(row)).length;

    const trackedDays = Math.max(1, Math.ceil((Date.now() - since.getTime()) / DAY_MS));
    const registeredDays = Math.floor((Date.now() - registration.createdAt.getTime()) / DAY_MS);

    const albionName = this.config.get('albion.gameActivityName');
    // Only Albion is reported. Other games are still recorded, but they are not what this
    // vote is about and listing them invites judging people on what else they play.
    const albionMinutes = gameTotals.find((game) => game.gameName === albionName)?.minutes ?? 0;

    const lines = [
      '### Metrics',
      `- 📅 Registered: ${discordTime(registration.createdAt, 'D')} — **${registeredDays}** days ago`,
    ];

    if (vote.toRank === '@ALB/Adept' && registration.graduateSince) {
      const graduateDays = Math.floor((Date.now() - registration.graduateSince.getTime()) / DAY_MS);
      lines.push(`- 🎓 Graduate since: ${discordTime(registration.graduateSince, 'D')} — **${graduateDays}** days ago`);
    }

    // No rows at all is not the same as a member who did nothing. Rendering zeroes and a red band
    // would read as a damning report when it usually means they predate tracking.
    if (rollup.length === 0 && gameTotals.length === 0) {
      lines.push(
        '',
        '📭 **No activity data recorded for this member.**',
        'That may mean they were inactive, or simply that nothing has been tracked for them yet — leadership will need to judge this one on what they know.',
      );
    }
    else {
      lines.push(gameTotals.length > 0
        ? `- ⚔️ **${albionName}: ${this.friendlyDuration(albionMinutes)}** ¹`
        : '- ⚔️ No game activity recorded ¹');

      lines.push(
        `- 🎙️ Voice: **${this.friendlyDuration(voiceMinutes)}** (${this.hoursPerDay(voiceMinutes, trackedDays)}) ²`,
        `- 💬 Messages: **${messages}** (${(messages / trackedDays).toFixed(1)}/day) ²`,
        `- ⭐ Reactions: **${reactions}** ²`,
        this.activityLine('📊 Activity all time registered', activeDays, trackedDays),
        this.activityLine(`📈 Activity last ${RECENT_WINDOW_DAYS} days`, recentActiveDays, Math.min(RECENT_WINDOW_DAYS, trackedDays)),
      );
    }

    if (trackingStart) {
      lines.push(`\n-# Activity tracking began ${discordTime(trackingStart, 'D')}. Figures cover the ${trackedDays} days since.`);
    }
    else {
      lines.push('\n-# Activity tracking has not recorded anything yet, for anyone.');
    }

    lines.push(
      '-# ¹ Game time is sampled from Discord presence — it only counts when the member has Discord open with game activity sharing enabled, so a low figure may reflect settings rather than inactivity.',
      '-# ² Monitored across the entire DIG server, not filtered by Albion section.',
    );

    return lines.join('\n');
  }

  activityLine(label: string, activeDays: number, trackedDays: number): string {
    const days = Math.max(1, trackedDays);
    const percent = ((activeDays / days) * 100).toFixed(0);

    return `- ${label}: **${activeDays}** of **${days}** days (${percent}%) — ${this.activityBand(activeDays, days)}`;
  }

  activityBand(activeDays: number, trackedDays: number): string {
    return activityBand(activeDays, trackedDays);
  }

  friendlyDuration(minutes: number): string {
    return friendlyDuration(minutes);
  }

  hoursPerDay(minutes: number, days: number): string {
    return hoursPerDay(minutes, days);
  }

  friendlyRank(roleName: string): string {
    return roleName.replace('@ALB/', '');
  }

  private async refuse(
    member: GuildMember,
    registration: AlbionRegistrationsEntity | null,
    tier: Tier | null,
    reason: RankUpRefusal,
    date?: Date,
  ): Promise<RankUpOutcome> {
    const reply = this.refusalReply(reason, date);

    await this.postDenialNotice(member, registration, tier, reason, date);

    return { ok: false, reply };
  }

  refusalReply(reason: RankUpRefusal, date?: Date): string {
    switch (reason) {
      case RankUpRefusal.NOT_REGISTERED:
        return '⛔ You are not registered with the DIG Albion guild, so you cannot request a rank up. Please use `/albion-register` first.';
      case RankUpRefusal.RANK_NOT_ELIGIBLE:
        return '⛔ This command does not apply to your current rank. Only Disciples and Graduates can request a rank up.';
      case RankUpRefusal.TOO_NEW:
        return `⛔ You have not been with us long enough yet. You can request a rank up ${discordTime(date, 'R')} (${discordTime(date, 'F')}).`;
      case RankUpRefusal.RECENT_FAILED_VOTE:
        return `⛔ Your last rank up vote did not pass. You can request another ${discordTime(date, 'R')} (${discordTime(date, 'F')}).`;
      case RankUpRefusal.NO_GRADUATE_DATE:
        return '⛔ We do not have a record of when you became a Graduate, so we cannot check the 4 week requirement. Please ask leadership.';
      case RankUpRefusal.VOTE_ALREADY_OPEN:
        return '⛔ You already have a rank up vote open. Please wait for leadership to finish voting on it.';
      case RankUpRefusal.NO_ELECTORATE:
        return '⛔ Your request could not be opened because no leadership were found to vote on it. Please tell leadership directly.';
    }
  }

  denialNoticeLine(
    discordId: string,
    tier: Tier | null,
    reason: RankUpRefusal,
    date?: Date,
  ): string {
    const route = tier
      ? ` from **${this.friendlyRank(tier.from)} → ${this.friendlyRank(tier.to)}**`
      : '';

    const because = {
      [RankUpRefusal.NOT_REGISTERED]: 'they have no Albion registration',
      [RankUpRefusal.RANK_NOT_ELIGIBLE]: 'their current rank cannot request a rank up',
      [RankUpRefusal.TOO_NEW]: date ? `they are too new (eligible ${discordTime(date, 'R')})` : 'they are too new',
      [RankUpRefusal.RECENT_FAILED_VOTE]: date ? `their last vote did not pass (next allowed ${discordTime(date, 'R')})` : 'their last vote did not pass',
      [RankUpRefusal.NO_GRADUATE_DATE]: 'we have no record of when they became a Graduate',
      [RankUpRefusal.VOTE_ALREADY_OPEN]: 'they already have a vote open',
      [RankUpRefusal.NO_ELECTORATE]: 'no electors were found to vote',
    }[reason];

    return `⛔ <@${discordId}> attempted to rank up${route} — denied: ${because}.`;
  }

  private async postDenialNotice(
    member: GuildMember,
    registration: AlbionRegistrationsEntity | null,
    tier: Tier | null,
    reason: RankUpRefusal,
    date?: Date,
  ): Promise<void> {
    try {
      const claimed = registration
        ? await this.claimDenialNotice(registration)
        : this.claimUnregisteredNotice(member.id);

      // The member always gets their ephemeral answer; only the public line is throttled
      if (!claimed) {
        return;
      }

      await this.judgementHall.send({
        content: this.denialNoticeLine(member.id, tier, reason, date),
        allowedMentions: { users: [] }, // A log for leadership, not a call to action
      });
    }
    catch (err) {
      this.logger.error(`Failed to post denial notice for ${member.id}: ${err.message}`);
    }
  }

  // An unregistered member has no row to throttle against, so this is held in memory. Losing it
  // on restart is fine - the worst case is one extra line in Judgement Hall.
  private claimUnregisteredNotice(discordId: string): boolean {
    const threshold = Date.now() - DENIAL_NOTICE_THROTTLE_HOURS * 60 * 60 * 1000;
    const last = this.unregisteredNotices.get(discordId) ?? 0;

    if (last > threshold) {
      return false;
    }

    this.unregisteredNotices.set(discordId, Date.now());
    return true;
  }

  // Claimed before sending, so two simultaneous refusals can't both post. A failed send then
  // costs at most one suppressed notice, which is the right way round for a rate limit.
  // 'run' is required: execute() otherwise returns rows, so an UPDATE comes back as [] and this
  // would always read as "somebody else claimed it" and never post a notice at all.
  private async claimDenialNotice(registration: AlbionRegistrationsEntity): Promise<boolean> {
    const threshold = new Date(Date.now() - DENIAL_NOTICE_THROTTLE_HOURS * 60 * 60 * 1000);
    const connection = this.registrationsRepository.getEntityManager().getConnection();

    const result = await connection.execute(
      `update albion_registrations_entity set last_denial_notice_at = ?, updated_at = ?
        where id = ? and (last_denial_notice_at is null or last_denial_notice_at < ?)`,
      [new Date(), new Date(), registration.id, threshold],
      'run',
    );

    return this.affectedRows(result) === 1;
  }
}
