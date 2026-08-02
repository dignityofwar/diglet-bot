import { Injectable, Logger } from '@nestjs/common';
import { Context, ContextOf, On } from 'necord';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { Message, TextChannel } from 'discord.js';
import {
  AlbionRankUpVoteEntity,
  AlbionRankUpVoteStatus,
} from '../../database/entities/albion.rank.up.vote.entity';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { AlbionRoleMapInterface, LeadershipPing } from '../../config/albion.app.config';
import { DiscordService } from '../../discord/discord.service';
import { resolvePartialReaction } from '../../discord/discord.hacks';
import { discordTime } from '../../helpers';

export const VOTE_APPROVE = '👍';
export const VOTE_SHRUG = '🤷';
export const VOTE_DISAPPROVE = '👎';
export const VOTE_VETO = '⛔';

export const VOTE_REACTIONS = [VOTE_APPROVE, VOTE_SHRUG, VOTE_DISAPPROVE, VOTE_VETO];

const REACTION_SCORES: Record<string, number> = {
  [VOTE_APPROVE]: 1,
  [VOTE_SHRUG]: 0.5,
  [VOTE_DISAPPROVE]: 0,
};

const DISCORD_UNKNOWN_MESSAGE = 10008;

// An early result is held this long before it is committed, so an elector who changes their mind
// flips the outcome rather than arriving after it was announced. Does not apply to a timeout,
// which has already had the full voting period.
export const PROVISIONAL_HOLD_MS = 60 * 60 * 1000;

// The live score line plus any hold notice beneath it, rewritten in place on every recount.
// Both are matched together so a stale hold notice can't survive the replacement.
const SCORE_LINE = /^Current score:.*(?:\n⏳.*)?$/m;

// Discord rate limits message edits, and a busy ballot recounts on every reaction
const SCORE_EDIT_THROTTLE_MS = 5000;

// How long a claimed but unposted ballot is left alone before it is treated as dead. Long enough
// that a publish still in flight is never reclaimed out from under itself.
export const UNPOSTED_GRACE_MS = 60 * 1000;

export interface VoteTally {
  score: number;
  electorsVoted: number;
  vetoedBy: string | null;
}

export interface GrantOutcome {
  attempted: boolean; // False when the rank isn't one the bot grants itself
  granted: boolean;
  error?: string;
}

@Injectable()
export class AlbionRankUpVoteService {
  private readonly logger = new Logger(AlbionRankUpVoteService.name);
  private readonly lastScoreEdit = new Map<number, number>();

  constructor(
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    private readonly albionUtilities: AlbionUtilities,
    @InjectRepository(AlbionRankUpVoteEntity) private readonly voteRepository: EntityRepository<AlbionRankUpVoteEntity>,
  ) {}

  @On('messageReactionAdd')
  async onReactionAdd(@Context() [reaction, user]: ContextOf<'messageReactionAdd'>): Promise<void> {
    await this.handleReaction(reaction, user);
  }

  @On('messageReactionRemove')
  async onReactionRemove(@Context() [reaction, user]: ContextOf<'messageReactionRemove'>): Promise<void> {
    await this.handleReaction(reaction, user);
  }

  private async handleReaction(reaction: unknown, user: unknown): Promise<void> {
    try {
      const { reaction: fullReaction, user: fullUser } = await resolvePartialReaction(
        reaction as never,
        user as never,
      );

      if (fullUser.bot) {
        return;
      }

      const vote = await this.voteRepository.findOne({
        messageId: fullReaction.message.id,
        status: AlbionRankUpVoteStatus.PENDING,
      });

      if (!vote) {
        return;
      }

      await this.evaluate(vote);
    }
    catch (err) {
      this.logger.error(`Error handling rank up vote reaction: ${err.message}`);
    }
  }

  // Recomputes from the message rather than adjusting a running total, so missed events and
  // restarts self heal. Fetches rather than reading caches - for a days old ballot the
  // reaction user cache is close to empty.
  async tally(message: Message): Promise<VoteTally> {
    const scores = new Map<string, number>();
    let vetoedBy: string | null = null;

    for (const reaction of message.reactions.cache.values()) {
      const emoji = reaction.emoji.name;

      if (emoji !== VOTE_VETO && !(emoji in REACTION_SCORES)) {
        continue;
      }

      const users = await reaction.users.fetch();

      for (const user of users.values()) {
        if (user.bot) {
          continue;
        }

        const member = message.guild?.members.cache.get(user.id);

        // Only Eldritch Mage and above may vote. Non electors are left in place, just ignored.
        if (!member || !this.albionUtilities.isElector(member)) {
          continue;
        }

        if (emoji === VOTE_VETO) {
          vetoedBy = user.id;
          continue;
        }

        // Highest value wins, so changing your mind without removing the old reaction
        // still only counts once
        scores.set(user.id, Math.max(scores.get(user.id) ?? 0, REACTION_SCORES[emoji]));
      }
    }

    const score = [...scores.values()].reduce((total, value) => total + value, 0);

    return {
      score,
      electorsVoted: vetoedBy ? scores.size + 1 : scores.size,
      vetoedBy,
    };
  }

  async evaluate(vote: AlbionRankUpVoteEntity): Promise<void> {
    let message: Message;

    try {
      message = await this.fetchBallot(vote);
    }
    catch (err) {
      if (err?.code === DISCORD_UNKNOWN_MESSAGE) {
        await this.resolve(vote, AlbionRankUpVoteStatus.ABANDONED, 0, 'The ballot message was deleted');
        return;
      }

      // A timeout or 5xx must leave the vote pending for the next tick, not abandon a live ballot
      this.logger.warn(`Could not fetch ballot ${vote.messageId}, leaving pending: ${err.message}`);
      return;
    }

    const tally = await this.tally(message);
    const outcome = this.determineOutcome(vote, tally);

    vote.score = tally.score;

    if (!outcome) {
      // Whatever was provisionally winning no longer is, so the hold is cancelled
      vote.provisionalStatus = null;
      vote.provisionalSince = null;
      vote.provisionalNote = null;
      await this.voteRepository.getEntityManager().persist(vote).flush();
      await this.refreshScoreLine(vote, message);
      return;
    }

    // Restart the hold if the outcome changed, e.g. a provisional pass becomes a veto
    if (vote.provisionalStatus !== outcome.status) {
      vote.provisionalStatus = outcome.status;
      vote.provisionalSince = new Date();
      vote.provisionalNote = outcome.note ?? null;
    }

    await this.voteRepository.getEntityManager().persist(vote).flush();

    if (this.holdElapsed(vote)) {
      await this.resolve(vote, outcome.status, tally.score, outcome.note);
      return;
    }

    await this.refreshScoreLine(vote, message);
  }

  determineOutcome(
    vote: AlbionRankUpVoteEntity,
    tally: VoteTally,
  ): { status: AlbionRankUpVoteStatus, note?: string } | null {
    if (tally.vetoedBy) {
      return { status: AlbionRankUpVoteStatus.VETOED, note: `Vetoed by <@${tally.vetoedBy}>` };
    }

    if (tally.score >= vote.requiredScore) {
      return { status: AlbionRankUpVoteStatus.PASSED };
    }

    // Clamped so a stale electorate size can never drive the remainder negative and fail
    // a vote early that could still have passed
    const remaining = Math.max(0, vote.electorateSize - tally.electorsVoted);

    if (tally.score + remaining < vote.requiredScore) {
      return { status: AlbionRankUpVoteStatus.FAILED, note: 'Could no longer reach the required score' };
    }

    return null;
  }

  holdElapsed(vote: AlbionRankUpVoteEntity): boolean {
    if (!vote.provisionalSince) {
      return false;
    }

    return Date.now() - vote.provisionalSince.getTime() >= PROVISIONAL_HOLD_MS;
  }

  scoreLine(vote: AlbionRankUpVoteEntity): string {
    const base = `Current score: **${vote.score}** / ${vote.requiredScore}`;

    if (!vote.provisionalStatus || !vote.provisionalSince) {
      return base;
    }

    const locksAt = new Date(vote.provisionalSince.getTime() + PROVISIONAL_HOLD_MS);
    const verb = {
      [AlbionRankUpVoteStatus.PASSED]: 'pass',
      [AlbionRankUpVoteStatus.VETOED]: 'be vetoed',
      [AlbionRankUpVoteStatus.FAILED]: 'fail',
    }[vote.provisionalStatus] ?? 'close';

    return `${base}\n⏳ This vote will be locked in and **${verb}** ${discordTime(locksAt, 'R')} — this is your window to change it.`;
  }

  // Rewrites the live score in place. Throttled because Discord rate limits edits and a busy
  // ballot recounts on every reaction.
  private async refreshScoreLine(vote: AlbionRankUpVoteEntity, message: Message): Promise<void> {
    const lastEdit = this.lastScoreEdit.get(vote.id) ?? 0;

    if (Date.now() - lastEdit < SCORE_EDIT_THROTTLE_MS) {
      return;
    }

    const updated = message.content.replace(SCORE_LINE, this.scoreLine(vote));

    if (updated === message.content) {
      return;
    }

    try {
      this.lastScoreEdit.set(vote.id, Date.now());
      await message.edit(updated);
    }
    catch (err) {
      this.logger.warn(`Could not update the score line on ballot ${vote.messageId}: ${err.message}`);
    }
  }

  private async fetchBallot(vote: AlbionRankUpVoteEntity): Promise<Message> {
    const channel = await this.discordService.getTextChannel(vote.channelId) as TextChannel;
    return await channel.messages.fetch(vote.messageId);
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

  // Elects a single winner in the database. Re-reading the row and checking it is still pending
  // is itself a race - two reactions landing together would both resolve and both announce.
  async resolve(
    vote: AlbionRankUpVoteEntity,
    status: AlbionRankUpVoteStatus,
    score: number,
    note?: string,
  ): Promise<boolean> {
    const connection = this.voteRepository.getEntityManager().getConnection();

    const result = await connection.execute(
      `update albion_rank_up_vote_entity
          set status = ?, score = ?, resolved_at = ?, resolution_note = ?, pending_key = null,
              provisional_status = null, provisional_since = null, provisional_note = null, updated_at = ?
        where id = ? and status = ?`,
      [status, score, new Date(), note ?? null, new Date(), vote.id, AlbionRankUpVoteStatus.PENDING],
      'run',
    );

    if (this.affectedRows(result) !== 1) {
      return false;
    }

    vote.status = status;
    vote.score = score;
    vote.resolutionNote = note ?? null;

    await this.announce(vote);
    return true;
  }

  // Claimed separately from resolution so a crash in between leaves a resolved but unannounced
  // vote for the cron to finish, rather than losing or duplicating the announcement.
  async announce(vote: AlbionRankUpVoteEntity): Promise<void> {
    const connection = this.voteRepository.getEntityManager().getConnection();

    const claim = await connection.execute(
      `update albion_rank_up_vote_entity set announced_at = ?, updated_at = ?
        where id = ? and announced_at is null`,
      [new Date(), new Date(), vote.id],
      'run',
    );

    if (this.affectedRows(claim) !== 1) {
      return;
    }

    try {
      // Grant the new rank before announcing, so the message can report what actually happened
      const granted = vote.status === AlbionRankUpVoteStatus.PASSED
        ? await this.grantRank(vote)
        : null;

      await this.editBallot(vote);
      await this.postOutcome(vote, granted);
    }
    catch (err) {
      this.logger.error(`Failed to announce outcome for vote ${vote.id}: ${err.message}`);
    }
  }

  // Applies the new rank in Discord, for the ranks configured as auto-assignable. Adept is not
  // one of them - it is soft-leadership, so a human grants it even after a vote passes.
  // The in-game rank is always a human's job; the bot has no way to do it.
  async grantRank(vote: AlbionRankUpVoteEntity): Promise<GrantOutcome> {
    const autoAssign: string[] = this.config.get('albion.autoAssignRanks') ?? [];

    if (!autoAssign.includes(vote.toRank)) {
      return { attempted: false, granted: false };
    }

    const roleMap: AlbionRoleMapInterface[] = this.config.get('albion.roleMap');
    const target = roleMap.find((role) => role.name === vote.toRank);
    const previous = roleMap.find((role) => role.name === vote.fromRank);

    if (!target) {
      return { attempted: true, granted: false, error: `no role configured for ${vote.toRank}` };
    }

    try {
      const member = await this.discordService.getGuildMember(
        this.config.get('discord.guildId'),
        vote.discordId,
      );

      await member.roles.add(await this.discordService.getRoleViaMember(member, target.discordRoleId));

      // The old rank is stripped when it is not marked "keep", matching what the daily scan
      // would otherwise flag as an inconsistency the next time it runs.
      if (previous && !previous.keep && member.roles.cache.has(previous.discordRoleId)) {
        await member.roles.remove(await this.discordService.getRoleViaMember(member, previous.discordRoleId));
      }

      this.logger.log(`Granted ${vote.toRank} to ${vote.discordId} after a passed vote`);
      return { attempted: true, granted: true };
    }
    catch (err) {
      this.logger.error(`Could not grant ${vote.toRank} to ${vote.discordId}: ${err.message}`);
      return { attempted: true, granted: false, error: err.message };
    }
  }

  private async editBallot(vote: AlbionRankUpVoteEntity): Promise<void> {
    if (vote.status === AlbionRankUpVoteStatus.ABANDONED) {
      return;
    }

    try {
      const message = await this.fetchBallot(vote);
      const header = this.outcomeHeader(vote);
      await message.edit(`${header}\n\n${message.content}`);
    }
    catch (err) {
      // An over long edit or a deleted ballot must not lose the outcome - postOutcome still runs
      this.logger.warn(`Could not edit ballot ${vote.messageId}: ${err.message}`);
    }
  }

  private outcomeHeader(vote: AlbionRankUpVoteEntity): string {
    const tally = `score ${vote.score} / ${vote.requiredScore}`;

    switch (vote.status) {
      case AlbionRankUpVoteStatus.PASSED:
        return `# ✅ PASSED — ${tally}`;
      case AlbionRankUpVoteStatus.VETOED:
        return `# ⛔ VETOED — ${vote.resolutionNote}`;
      case AlbionRankUpVoteStatus.FAILED:
        return `# ❌ FAILED — ${tally}`;
      case AlbionRankUpVoteStatus.TIMED_OUT:
        return `# ⏰ TIMED OUT — ${tally}`;
      default:
        return `# 🚫 CLOSED — ${vote.resolutionNote ?? 'no longer trackable'}`;
    }
  }

  private async postOutcome(vote: AlbionRankUpVoteEntity, granted?: GrantOutcome | null): Promise<void> {
    const channel = await this.discordService.getTextChannel(vote.channelId);
    const link = `https://discord.com/channels/${this.config.get('discord.guildId')}/${vote.channelId}/${vote.messageId}`;

    if (vote.status === AlbionRankUpVoteStatus.PASSED) {
      const ping: LeadershipPing = this.config.get('albion.leadershipPing');

      await channel.send({
        content: [
          `${ping.mention} Rank up vote **passed** for <@${vote.discordId}> (${vote.characterName}) — **${this.friendlyRank(vote.fromRank)} → ${this.friendlyRank(vote.toRank)}**, score ${vote.score}/${vote.requiredScore}.`,
          '',
          this.whatIsLeftToDo(vote, granted),
          link,
        ].join('\n'),
        allowedMentions: { roles: ping.roles, users: [...ping.users, vote.discordId] },
      });
      return;
    }

    // Nothing for anyone to do on a veto, fail, timeout or abandonment, so no ping
    await channel.send({
      content: `${this.outcomeHeader(vote)}\nRank up request for <@${vote.discordId}> (${vote.characterName}) — ${this.friendlyRank(vote.fromRank)} → ${this.friendlyRank(vote.toRank)}.\n${link}`,
      allowedMentions: { users: [] },
    });
  }

  // The in-game rank always needs a human; only the Discord half can be automated
  whatIsLeftToDo(vote: AlbionRankUpVoteEntity, granted?: GrantOutcome | null): string {
    const rank = this.friendlyRank(vote.toRank);

    if (granted?.granted) {
      return `✅ I have given them the **${rank}** role in Discord.\n⚠️ Their rank still needs changing **in-game**.`;
    }

    if (granted?.attempted) {
      return `⚠️ I could not give them the **${rank}** role: ${granted.error}\nIt needs adding by hand, along with the in-game rank.`;
    }

    return 'Their rank needs changing in Discord **and** in-game.';
  }

  friendlyRank(roleName: string): string {
    return roleName.replace('@ALB/', '');
  }

  // Every caller must pass 'run' to execute(). The default returns rows, so an UPDATE comes back
  // as [] and every election here would silently read as "somebody else won".
  private affectedRows(result: unknown): number {
    if (typeof result === 'number') {
      return result;
    }

    return (result as { affectedRows?: number })?.affectedRows ?? 0;
  }
}
