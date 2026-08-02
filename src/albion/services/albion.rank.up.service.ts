import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMember, TextChannel } from 'discord.js';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionRankUpVoteEntity } from '../../database/entities/albion.rank.up.vote.entity';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { DiscordService } from '../../discord/discord.service';
import { MemberActivityRollupService } from '../../general/services/member.activity.rollup.service';
import { VOTE_REACTIONS } from './albion.rank.up.vote.service';
import { discordTime } from '../../helpers';

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUEST_COOLDOWN_DAYS = 7;
const DENIAL_NOTICE_THROTTLE_HOURS = 24;
const VOTE_DURATION_DAYS = 5;
const MAX_CHARACTER_NAME = 32;
const MAX_GAME_NAME = 48;

export enum RankUpRefusal {
  NOT_REGISTERED = 'NOT_REGISTERED',
  RANK_NOT_ELIGIBLE = 'RANK_NOT_ELIGIBLE',
  TOO_NEW = 'TOO_NEW',
  COOLDOWN = 'COOLDOWN',
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

    if (registration.lastRankUpRequestAt) {
      const nextAllowed = new Date(registration.lastRankUpRequestAt.getTime() + REQUEST_COOLDOWN_DAYS * DAY_MS);

      if (nextAllowed > new Date()) {
        return await this.refuse(member, registration, tier, RankUpRefusal.COOLDOWN, nextAllowed);
      }
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

    return await this.publish(member, registration, tier, anchor);
  }

  private async publish(
    member: GuildMember,
    registration: AlbionRegistrationsEntity,
    tier: Tier,
    anchor: Date,
  ): Promise<RankUpOutcome> {
    const electors = await this.albionUtilities.getElectors(member.guild);

    // floor(0/2)+1 is 1, which would post a ballot any single reaction could pass.
    // That's a configuration fault, not a vote.
    if (electors.length === 0) {
      this.logger.error('Refusing to open a rank up ballot: no electors found in the guild');
      return await this.refuse(member, registration, tier, RankUpRefusal.NO_ELECTORATE);
    }

    const requiredScore = Math.floor(electors.length / 2) + 1;
    const expiresAt = new Date(Date.now() + VOTE_DURATION_DAYS * DAY_MS);
    const characterName = registration.characterName.slice(0, MAX_CHARACTER_NAME);

    // The row goes in before the Discord post. Posting first means a flush failure leaves a
    // public ballot nothing tracks and nothing will ever resolve.
    let vote: AlbionRankUpVoteEntity;

    try {
      vote = new AlbionRankUpVoteEntity({
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
      await this.voteRepository.getEntityManager().persist(vote).flush();
    }
    catch (err) {
      this.logger.warn(`Refused a duplicate rank up ballot for ${member.id}: ${err.message}`);
      return await this.refuse(member, registration, tier, RankUpRefusal.VOTE_ALREADY_OPEN);
    }

    const content = await this.buildBallot(member, registration, tier, anchor, electors.length, requiredScore, expiresAt);
    const pingRole = this.config.get('albion.leadershipPingRole');
    let message: Awaited<ReturnType<TextChannel['send']>>;

    try {
      message = await this.judgementHall.send({
        content,
        allowedMentions: { roles: [pingRole], users: [member.id] },
      });
    }
    catch (err) {
      // Don't lock the member out behind a ballot that never went up
      vote.status = 'abandoned' as AlbionRankUpVoteEntity['status'];
      vote.pendingKey = null;
      vote.resolutionNote = 'The ballot could not be posted';
      await this.voteRepository.getEntityManager().persist(vote).flush();

      this.logger.error(`Failed to post rank up ballot for ${member.id}: ${err.message}`);
      return { ok: false, reply: '⛔ Could not post your rank up request. Please tell leadership.' };
    }

    try {
      vote.messageId = message.id;
      registration.lastRankUpRequestAt = new Date();
      await this.voteRepository.getEntityManager().persist(vote).persist(registration).flush();
    }
    catch (err) {
      // The ballot is public and now untracked - the one case that needs a human
      this.logger.error(`Rank up ballot ${message.id} is public but could not be tracked: ${err.message}`);
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

  private async buildBallot(
    member: GuildMember,
    registration: AlbionRegistrationsEntity,
    tier: Tier,
    anchor: Date,
    electorateSize: number,
    requiredScore: number,
    expiresAt: Date,
  ): Promise<string> {
    const pingRole = this.config.get('albion.leadershipPingRole');
    const stats = await this.buildActivityBlock(member.id, anchor, registration, tier);

    return `<@&${pingRole}>

Guildmember <@${member.id}> wants to be ranked up from **${this.friendlyRank(tier.from)}** to **${this.friendlyRank(tier.to)}**.
Please react with the following:

👍 - to approve the rank up
🤷 - to say "I don't know the person well enough"
👎 - to disapprove the rank up
⛔ - to put a veto on the rank up (this action needs justification with proof)

👍 = 1 point · 🤷 = 0.5 points · 👎 = 0 points · ⛔ ends the vote immediately

Eligible voters: ${electorateSize}
Passes at a score of ${requiredScore}
Voting closes ${discordTime(expiresAt, 'R')}

Current score: **0** / ${requiredScore}

${stats}`;
  }

  private async buildActivityBlock(
    discordId: string,
    anchor: Date,
    registration: AlbionRegistrationsEntity,
    tier: Tier,
  ): Promise<string> {
    const trackingStart = await this.rollupService.getTrackingStartDate();
    const since = trackingStart && trackingStart > anchor ? trackingStart : anchor;

    const rollup = await this.rollupService.getRollup(discordId, since);
    const gameTotals = await this.rollupService.getGameTotals(discordId, since);

    const messages = rollup.reduce((total, row) => total + row.messagesSent, 0);
    const reactions = rollup.reduce((total, row) => total + row.reactionsAdded, 0);
    const voiceMinutes = rollup.reduce((total, row) => total + row.voiceMinutes, 0);
    const activeDays = rollup.filter(
      (row) => row.messagesSent > 0 || row.reactionsAdded > 0 || row.voiceMinutes > 0,
    ).length;

    const trackedDays = Math.max(1, Math.ceil((Date.now() - since.getTime()) / DAY_MS));
    const registeredDays = Math.floor((Date.now() - registration.createdAt.getTime()) / DAY_MS);

    const albionName = this.config.get('albion.gameActivityName');
    const albionMinutes = gameTotals.find((game) => game.gameName === albionName)?.minutes ?? 0;
    const otherGames = gameTotals
      .filter((game) => game.gameName !== albionName)
      .slice(0, 3)
      .map((game) => `${game.gameName.slice(0, MAX_GAME_NAME)} ${Math.round(game.minutes / 60)}h`);

    const lines = [
      '### Activity',
      `**Character:** ${registration.characterName}`,
      `**Registered:** ${discordTime(registration.createdAt, 'D')} — ${registeredDays} days ago`,
    ];

    if (tier.to === '@ALB/Adept' && registration.graduateSince) {
      const graduateDays = Math.floor((Date.now() - registration.graduateSince.getTime()) / DAY_MS);
      lines.push(`**Graduate since:** ${discordTime(registration.graduateSince, 'D')} — ${graduateDays} days ago`);
    }

    lines.push(`- ⚔️ **${albionName}: ${this.friendlyDuration(albionMinutes)}**`);

    if (otherGames.length > 0) {
      lines.push(`- 🎮 Other games: ${otherGames.join(', ')}`);
    }

    lines.push(
      `- 🎙️ Voice: **${this.friendlyDuration(voiceMinutes)}**`,
      `- 💬 Messages: **${messages}** (${(messages / trackedDays).toFixed(1)}/day)`,
      `- ⭐ Reactions: **${reactions}**`,
      `- 📊 Active on **${activeDays}** of **${trackedDays}** days (${((activeDays / trackedDays) * 100).toFixed(0)}%) — ${this.activityBand(activeDays, trackedDays)}`,
    );

    if (trackingStart) {
      lines.push(`\n-# Activity tracking began ${discordTime(trackingStart, 'D')}. Figures cover the ${trackedDays} days since.`);
    }
    else {
      lines.push('\n-# No activity has been recorded yet, so these figures are all zero.');
    }

    lines.push('-# Game time is sampled from Discord presence — it only counts when the member has Discord open with game activity sharing enabled, so a low figure may reflect settings rather than inactivity.');

    return lines.join('\n');
  }

  activityBand(activeDays: number, trackedDays: number): string {
    if (trackedDays <= 0) {
      return '🔴 Low';
    }

    const ratio = activeDays / trackedDays;

    if (ratio >= 0.75) return '🟢 Very active';
    if (ratio >= 0.5) return '🟡 Active';
    if (ratio >= 0.25) return '🟠 Occasional';
    return '🔴 Low';
  }

  friendlyDuration(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    return `${hours}h ${minutes % 60}m`;
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
      case RankUpRefusal.COOLDOWN:
        return `⛔ You have already requested a rank up recently. You can try again ${discordTime(date, 'R')} (${discordTime(date, 'F')}).`;
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
      [RankUpRefusal.COOLDOWN]: date ? `they requested one recently (next allowed ${discordTime(date, 'R')})` : 'they requested one recently',
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
      if (registration && !await this.claimDenialNotice(registration)) {
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

  // Claimed before sending, so two simultaneous refusals can't both post. A failed send then
  // costs at most one suppressed notice, which is the right way round for a rate limit.
  private async claimDenialNotice(registration: AlbionRegistrationsEntity): Promise<boolean> {
    const threshold = new Date(Date.now() - DENIAL_NOTICE_THROTTLE_HOURS * 60 * 60 * 1000);
    const connection = this.registrationsRepository.getEntityManager().getConnection();

    const result = await connection.execute(
      `update albion_registrations_entity set last_denial_notice_at = ?, updated_at = ?
        where id = ? and (last_denial_notice_at is null or last_denial_notice_at < ?)`,
      [new Date(), new Date(), registration.id, threshold],
    );

    const affected = typeof result === 'number'
      ? result
      : (result as { affectedRows?: number })?.affectedRows ?? 0;

    return affected === 1;
  }
}
