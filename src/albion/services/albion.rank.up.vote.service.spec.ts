/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Collection } from 'discord.js';
import {
  AlbionRankUpVoteService,
  PROVISIONAL_HOLD_MS,
  scoreHeading,
  UNPOSTED_GRACE_MS,
  VOTE_APPROVE,
  VOTE_DISAPPROVE,
  VOTE_SHRUG,
  VOTE_VETO,
} from './albion.rank.up.vote.service';
import {
  AlbionRankUpVoteEntity,
  AlbionRankUpVoteStatus,
} from '../../database/entities/albion.rank.up.vote.entity';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { DiscordService } from '../../discord/discord.service';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('AlbionRankUpVoteService', () => {
  let service: AlbionRankUpVoteService;
  let voteRepository: any;
  let discordService: any;
  let albionUtilities: any;
  let execute: jest.Mock;
  let channelSend: jest.Mock;
  let messageEdit: jest.Mock;

  const makeVote = (overrides: Partial<AlbionRankUpVoteEntity> = {}): any => ({
    id: 1,
    messageId: 'msg-1',
    channelId: 'chan-1',
    discordId: 'candidate',
    characterName: 'Testy',
    fromRank: '@ALB/Disciple',
    toRank: '@ALB/Graduate',
    requiredScore: 4,
    electorateSize: 7,
    status: AlbionRankUpVoteStatus.PENDING,
    score: 0,
    provisionalStatus: null,
    provisionalSince: null,
    provisionalNote: null,
    expiresAt: new Date(Date.now() + 1000),
    ...overrides,
  });

  // Builds a message whose reactions resolve to the given voters
  const makeMessage = (reactions: Record<string, string[]>, content = '## 📊 Current score: 0 / 4') => {
    const cache = new Collection<string, any>();

    for (const [emoji, userIds] of Object.entries(reactions)) {
      cache.set(emoji, {
        emoji: { name: emoji },
        users: {
          fetch: jest.fn().mockResolvedValue(
            new Collection<string, any>(userIds.map((id) => [id, { id, bot: id === 'bot' }])),
          ),
        },
      });
    }

    return {
      id: 'msg-1',
      content,
      reactions: { cache },
      edit: messageEdit,
      guild: {
        members: {
          cache: new Collection<string, any>(
            ['e1', 'e2', 'e3', 'e4', 'e5', 'nonElector', 'bot'].map((id) => [id, { id }]),
          ),
        },
      },
    } as any;
  };

  beforeEach(async () => {
    execute = jest.fn().mockResolvedValue({ affectedRows: 1 });
    channelSend = jest.fn().mockResolvedValue({ id: 'outcome-1' });
    messageEdit = jest.fn().mockResolvedValue(true);

    voteRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      getEntityManager: jest.fn().mockReturnValue({
        persist: jest.fn().mockReturnThis(),
        flush: jest.fn().mockResolvedValue(true),
        getConnection: jest.fn().mockReturnValue({ execute }),
      }),
    };

    discordService = {
      getTextChannel: jest.fn().mockResolvedValue({
        id: 'chan-1',
        send: channelSend,
        messages: { fetch: jest.fn() },
      }),
    };

    // Everyone except "nonElector" may vote
    albionUtilities = { isElector: jest.fn().mockImplementation((m: any) => m.id !== 'nonElector') };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRankUpVoteService,
        ConfigService,
        { provide: DiscordService, useValue: discordService },
        { provide: AlbionUtilities, useValue: albionUtilities },
        { provide: getRepositoryToken(AlbionRankUpVoteEntity), useValue: voteRepository },
      ],
    }).compile();

    TestBootstrapper.setupConfig(module);
    service = module.get<AlbionRankUpVoteService>(AlbionRankUpVoteService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('tally', () => {
    it('scores approve as 1, shrug as 0.5 and disapprove as 0', async () => {
      const tally = await service.tally(makeMessage({
        [VOTE_APPROVE]: ['e1', 'e2'],
        [VOTE_SHRUG]: ['e3'],
        [VOTE_DISAPPROVE]: ['e4'],
      }));

      expect(tally.score).toBe(2.5);
      expect(tally.electorsVoted).toBe(4);
    });

    // Would otherwise pass every ballot the instant it was posted
    it('ignores the bot\'s own pre-added reactions', async () => {
      const tally = await service.tally(makeMessage({
        [VOTE_APPROVE]: ['bot'],
        [VOTE_SHRUG]: ['bot'],
        [VOTE_DISAPPROVE]: ['bot'],
        [VOTE_VETO]: ['bot'],
      }));

      expect(tally.score).toBe(0);
      expect(tally.vetoedBy).toBeNull();
    });

    it('ignores reactions from non-electors', async () => {
      const tally = await service.tally(makeMessage({ [VOTE_APPROVE]: ['nonElector'] }));

      expect(tally.score).toBe(0);
    });

    it('counts an elector once at their highest value', async () => {
      const tally = await service.tally(makeMessage({
        [VOTE_APPROVE]: ['e1'],
        [VOTE_SHRUG]: ['e1'],
      }));

      expect(tally.score).toBe(1);
      expect(tally.electorsVoted).toBe(1);
    });

    it('ignores unrelated emoji', async () => {
      const tally = await service.tally(makeMessage({ '🎉': ['e1', 'e2'] }));

      expect(tally.score).toBe(0);
    });

    // Cache-only counting passes with mocks and fails in production on any older ballot
    it('fetches each reaction\'s users rather than reading the cache', async () => {
      const message = makeMessage({ [VOTE_APPROVE]: ['e1'] });

      await service.tally(message);

      expect(message.reactions.cache.get(VOTE_APPROVE).users.fetch).toHaveBeenCalled();
    });
  });

  describe('determineOutcome', () => {
    it('passes at exactly the required score', () => {
      const outcome = service.determineOutcome(makeVote(), { score: 4, electorsVoted: 4, vetoedBy: null });

      expect(outcome?.status).toBe(AlbionRankUpVoteStatus.PASSED);
    });

    it('stays open one point short', () => {
      const outcome = service.determineOutcome(makeVote(), { score: 3.5, electorsVoted: 4, vetoedBy: null });

      expect(outcome).toBeNull();
    });

    it('a veto beats a passing score', () => {
      const outcome = service.determineOutcome(makeVote(), { score: 7, electorsVoted: 7, vetoedBy: 'e1' });

      expect(outcome?.status).toBe(AlbionRankUpVoteStatus.VETOED);
      expect(outcome?.note).toContain('e1');
    });

    it('fails early once the score can no longer be reached', () => {
      // 7 electors, all voted, only 2 points - no one left to make up the difference
      const outcome = service.determineOutcome(makeVote(), { score: 2, electorsVoted: 7, vetoedBy: null });

      expect(outcome?.status).toBe(AlbionRankUpVoteStatus.FAILED);
    });

    // The electorate can shrink after posting if someone loses their role having already voted,
    // leaving more voters than the frozen size. The clamp keeps the arithmetic sane; a passing
    // score is still caught by the check above it, so this can only ever close a doomed vote.
    it('handles more voters than the frozen electorate without going negative', () => {
      const stillPassing = service.determineOutcome(makeVote({ electorateSize: 2 }), {
        score: 4,
        electorsVoted: 9,
        vetoedBy: null,
      });
      expect(stillPassing?.status).toBe(AlbionRankUpVoteStatus.PASSED);

      const doomed = service.determineOutcome(makeVote({ electorateSize: 2 }), {
        score: 3.5,
        electorsVoted: 9,
        vetoedBy: null,
      });
      expect(doomed?.status).toBe(AlbionRankUpVoteStatus.FAILED);
    });
  });

  describe('hysteresis', () => {
    it('holds a passing result rather than resolving immediately', async () => {
      const vote = makeVote();
      discordService.getTextChannel.mockResolvedValue({
        id: 'chan-1',
        send: channelSend,
        messages: { fetch: jest.fn().mockResolvedValue(makeMessage({ [VOTE_APPROVE]: ['e1', 'e2', 'e3', 'e4'] })) },
      });

      await service.evaluate(vote);

      expect(vote.provisionalStatus).toBe(AlbionRankUpVoteStatus.PASSED);
      expect(vote.provisionalSince).toBeInstanceOf(Date);
      expect(execute).not.toHaveBeenCalled(); // Nothing resolved yet
    });

    it('commits once the hold has elapsed', async () => {
      const vote = makeVote({
        provisionalStatus: AlbionRankUpVoteStatus.PASSED,
        provisionalSince: new Date(Date.now() - PROVISIONAL_HOLD_MS - 1000),
      });
      discordService.getTextChannel.mockResolvedValue({
        id: 'chan-1',
        send: channelSend,
        messages: { fetch: jest.fn().mockResolvedValue(makeMessage({ [VOTE_APPROVE]: ['e1', 'e2', 'e3', 'e4'] })) },
      });

      await service.evaluate(vote);

      expect(execute.mock.calls[0][0]).toContain('set status = ?');
      expect(execute.mock.calls[0][1][0]).toBe(AlbionRankUpVoteStatus.PASSED);
    });

    it('cancels the hold when someone changes their mind', async () => {
      const vote = makeVote({
        score: 4,
        provisionalStatus: AlbionRankUpVoteStatus.PASSED,
        provisionalSince: new Date(),
      });
      discordService.getTextChannel.mockResolvedValue({
        id: 'chan-1',
        send: channelSend,
        messages: { fetch: jest.fn().mockResolvedValue(makeMessage({ [VOTE_APPROVE]: ['e1', 'e2'] })) },
      });

      await service.evaluate(vote);

      expect(vote.provisionalStatus).toBeNull();
      expect(vote.provisionalSince).toBeNull();
      expect(execute).not.toHaveBeenCalled();
    });

    it('restarts the hold when the outcome flips to a veto', async () => {
      const startedAt = new Date(Date.now() - PROVISIONAL_HOLD_MS + 5000);
      const vote = makeVote({
        provisionalStatus: AlbionRankUpVoteStatus.PASSED,
        provisionalSince: startedAt,
      });
      discordService.getTextChannel.mockResolvedValue({
        id: 'chan-1',
        send: channelSend,
        messages: {
          fetch: jest.fn().mockResolvedValue(makeMessage({
            [VOTE_APPROVE]: ['e1', 'e2', 'e3', 'e4'],
            [VOTE_VETO]: ['e5'],
          })),
        },
      });

      await service.evaluate(vote);

      expect(vote.provisionalStatus).toBe(AlbionRankUpVoteStatus.VETOED);
      expect(vote.provisionalSince!.getTime()).toBeGreaterThan(startedAt.getTime());
      expect(execute).not.toHaveBeenCalled();
    });

    it('tells electors when the result locks in and what it will be', () => {
      const vote = makeVote({
        score: 4,
        provisionalStatus: AlbionRankUpVoteStatus.PASSED,
        provisionalSince: new Date(),
      });

      const line = service.scoreLine(vote);

      expect(line).toContain('## 📊 Current score: 4 / 4');
      expect(line).toContain('locked in');
      expect(line).toContain('pass');
      expect(line).toContain('window to change it');
    });

    it('shows only the score when nothing is being held', () => {
      const line = service.scoreLine(makeVote({ score: 2 }));

      expect(line).toBe('## 📊 Current score: 2 / 4');
      expect(line).not.toContain('locked in');
    });
  });

  describe('resolve', () => {
    it('announces when it wins the conditional update', async () => {
      execute.mockResolvedValue({ affectedRows: 1 });

      const resolved = await service.resolve(makeVote(), AlbionRankUpVoteStatus.PASSED, 4);

      expect(resolved).toBe(true);
      expect(channelSend).toHaveBeenCalled();
    });

    // The race two simultaneous reactions would otherwise cause
    it('announces nothing when another caller already resolved it', async () => {
      execute.mockResolvedValue({ affectedRows: 0 });

      const resolved = await service.resolve(makeVote(), AlbionRankUpVoteStatus.PASSED, 4);

      expect(resolved).toBe(false);
      expect(channelSend).not.toHaveBeenCalled();
    });

    it('clears the pending key so the member is not locked out', async () => {
      await service.resolve(makeVote(), AlbionRankUpVoteStatus.FAILED, 1);

      expect(execute.mock.calls[0][0]).toContain('pending_key = null');
    });

    // Without 'run' the driver returns rows, so an UPDATE comes back as [] and every election
    // reads as lost - votes would resolve in the database and never announce
    it('asks for the affected row count', async () => {
      await service.resolve(makeVote(), AlbionRankUpVoteStatus.PASSED, 4);

      for (const call of execute.mock.calls) {
        expect(call[2]).toBe('run');
      }
    });
  });

  describe('the live score line', () => {
    // The regex that rewrites it has to match what the ballot builder wrote. If they drift, the
    // score silently stops updating and nothing errors.
    it('rewrites the heading the ballot builder produces', async () => {
      const message = makeMessage({ [VOTE_APPROVE]: ['e1', 'e2'] }, scoreHeading(0, 4));
      discordService.getTextChannel = jest.fn().mockResolvedValue({
        id: 'chan-1', send: channelSend, messages: { fetch: jest.fn().mockResolvedValue(message) },
      });

      await service.evaluate(makeVote());

      expect(messageEdit).toHaveBeenCalledWith(scoreHeading(2, 4));
    });

    // A ballot posted before the heading existed must keep updating across the deploy
    it('still rewrites a ballot posted without the heading', async () => {
      const message = makeMessage({ [VOTE_APPROVE]: ['e1', 'e2'] }, 'Current score: **0** / 4');
      discordService.getTextChannel = jest.fn().mockResolvedValue({
        id: 'chan-1', send: channelSend, messages: { fetch: jest.fn().mockResolvedValue(message) },
      });

      await service.evaluate(makeVote());

      expect(messageEdit).toHaveBeenCalledWith(scoreHeading(2, 4));
    });

    it('is a heading so it stands out from the ballot body', () => {
      expect(scoreHeading(2, 4).startsWith('## ')).toBe(true);
    });
  });

  describe('reclaimUnposted', () => {
    it('only touches pending rows that never got a message', async () => {
      await service.reclaimUnposted();

      expect(execute.mock.calls[0][0]).toContain('message_id is null');
      expect(execute.mock.calls[0][0]).toContain('status = ?');
      expect(execute.mock.calls[0][1]).toContain(AlbionRankUpVoteStatus.ABANDONED);
    });

    it('frees the pending key so the member can ask again', async () => {
      await service.reclaimUnposted();

      expect(execute.mock.calls[0][0]).toContain('pending_key = null');
    });

    // Otherwise the reconcile sweep would try to post an outcome for a ballot nobody ever saw
    it('marks the row announced so nothing tries to post an outcome', async () => {
      await service.reclaimUnposted();

      expect(execute.mock.calls[0][0]).toContain('announced_at = ?');
    });

    // Only bounds how recent a claim can be and still be reclaimed. It does not prove a
    // concurrent publish is safe - trackBallot()'s conditional write is what does that.
    it('only considers claims older than the grace window', async () => {
      await service.reclaimUnposted();

      const cutoff: Date = execute.mock.calls[0][1].at(-1);
      expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(UNPOSTED_GRACE_MS);
    });

    it('narrows to one member when given a discord ID', async () => {
      await service.reclaimUnposted('candidate');

      expect(execute.mock.calls[0][0]).toContain('and discord_id = ?');
      expect(execute.mock.calls[0][1].at(-1)).toBe('candidate');
    });

    it('reports how many it reclaimed', async () => {
      execute.mockResolvedValue({ affectedRows: 2 });

      expect(await service.reclaimUnposted()).toBe(2);
    });

    it('asks for the affected row count', async () => {
      await service.reclaimUnposted();

      expect(execute.mock.calls[0][2]).toBe('run');
    });
  });

  describe('announcement recovery', () => {
    const passed = () => makeVote({ status: AlbionRankUpVoteStatus.PASSED, toRank: '@ALB/Adept' });
    const releaseCall = () => execute.mock.calls.find((c: any[]) => c[0].includes('announced_at = null'));

    const withBallot = (content = '## 📊 Current score: 4 / 4') => {
      discordService.getTextChannel = jest.fn().mockResolvedValue({
        id: 'chan-1',
        send: channelSend,
        messages: { fetch: jest.fn().mockResolvedValue(makeMessage({}, content)) },
      });
    };

    beforeEach(() => withBallot());

    // The claim is stamped before the Discord work. Without handing it back, a transient failure
    // suppresses the outcome forever - reconcileUnannounced only looks for announcedAt null
    it('hands the claim back when announcing fails', async () => {
      channelSend.mockRejectedValue(new Error('discord is down'));

      await service.announce(passed());

      expect(releaseCall()).toBeDefined();
      expect(releaseCall()[2]).toBe('run');
    });

    it('keeps the claim when announcing succeeds', async () => {
      await service.announce(passed());

      expect(releaseCall()).toBeUndefined();
    });

    it('does nothing when another caller already claimed the announcement', async () => {
      execute.mockResolvedValue({ affectedRows: 0 });

      await service.announce(passed());

      expect(channelSend).not.toHaveBeenCalled();
    });

    // A retried announcement must not stack a second outcome header on the ballot
    it('does not re-prepend a header the ballot already carries', async () => {
      withBallot('# ✅ PASSED — score 4 / 4\n\n## 📊 Current score: 4 / 4');

      await service.announce(passed());

      expect(messageEdit).not.toHaveBeenCalled();
    });

    it('prepends the header when the ballot does not have one', async () => {
      await service.announce(passed());

      expect(messageEdit).toHaveBeenCalledWith(expect.stringContaining('# ✅ PASSED'));
    });
  });

  describe('granting the rank', () => {
    let memberRoles: any;

    beforeEach(() => {
      memberRoles = {
        add: jest.fn().mockResolvedValue(true),
        remove: jest.fn().mockResolvedValue(true),
        cache: new Collection<string, any>([['1218115269419995166', { id: '1218115269419995166' }]]),
      };
      discordService.getGuildMember = jest.fn().mockResolvedValue({ id: 'candidate', roles: memberRoles });
      discordService.getRoleViaMember = jest.fn().mockImplementation(async (_m, id) => ({ id }));
    });

    it('grants Graduate when the vote passes', async () => {
      const outcome = await service.grantRank(makeVote({ toRank: '@ALB/Graduate' }));

      expect(outcome).toEqual({ attempted: true, granted: true });
      expect(memberRoles.add).toHaveBeenCalledWith({ id: '1218115340009996339' });
    });

    // Disciple is keep:false, so leaving it would be flagged by the next daily scan
    it('strips the Disciple role it replaces', async () => {
      await service.grantRank(makeVote({ fromRank: '@ALB/Disciple', toRank: '@ALB/Graduate' }));

      expect(memberRoles.remove).toHaveBeenCalledWith({ id: '1218115269419995166' });
    });

    // Adept is soft-leadership; a human grants it even after a passing vote
    it('does not grant Adept', async () => {
      const outcome = await service.grantRank(makeVote({ fromRank: '@ALB/Graduate', toRank: '@ALB/Adept' }));

      expect(outcome).toEqual({ attempted: false, granted: false });
      expect(memberRoles.add).not.toHaveBeenCalled();
    });

    it('reports the failure rather than throwing when the member has left', async () => {
      discordService.getGuildMember.mockRejectedValue(new Error('Unknown Member'));

      const outcome = await service.grantRank(makeVote({ toRank: '@ALB/Graduate' }));

      expect(outcome.granted).toBe(false);
      expect(outcome.error).toContain('Unknown Member');
    });

    it('does not strip a role marked keep', async () => {
      memberRoles.cache = new Collection<string, any>([['1218115340009996339', { id: '1218115340009996339' }]]);

      await service.grantRank(makeVote({ fromRank: '@ALB/Graduate', toRank: '@ALB/Graduate' }));

      expect(memberRoles.remove).not.toHaveBeenCalled();
    });
  });

  describe('what is left to do', () => {
    it('tells leadership only the in-game rank remains when the role was granted', () => {
      const line = service.whatIsLeftToDo(makeVote({ toRank: '@ALB/Graduate' }), { attempted: true, granted: true });

      expect(line).toContain('I have given them the **Graduate** role');
      expect(line).toContain('in-game');
    });

    it('asks for both when the rank is not auto-assigned', () => {
      const line = service.whatIsLeftToDo(makeVote({ toRank: '@ALB/Adept' }), { attempted: false, granted: false });

      expect(line).toContain('Discord **and** in-game');
    });

    it('surfaces the error when granting failed', () => {
      const line = service.whatIsLeftToDo(
        makeVote({ toRank: '@ALB/Graduate' }),
        { attempted: true, granted: false, error: 'Missing Permissions' },
      );

      expect(line).toContain('could not give them');
      expect(line).toContain('Missing Permissions');
      expect(line).toContain('by hand');
    });
  });

  describe('announce', () => {
    it('pings leadership only when the vote passed', async () => {
      await service.announce(makeVote({ status: AlbionRankUpVoteStatus.PASSED, score: 4 }));

      const payload = channelSend.mock.calls[0][0];
      expect(payload.content).toContain('passed');
      expect(payload.allowedMentions.roles).toHaveLength(1);
    });

    it('grants the role then tells leadership the in-game rank remains', async () => {
      discordService.getGuildMember = jest.fn().mockResolvedValue({
        id: 'candidate',
        roles: {
          add: jest.fn().mockResolvedValue(true),
          remove: jest.fn().mockResolvedValue(true),
          cache: new Collection<string, any>(),
        },
      });
      discordService.getRoleViaMember = jest.fn().mockImplementation(async (_m, id) => ({ id }));

      await service.announce(makeVote({ status: AlbionRankUpVoteStatus.PASSED, score: 4, toRank: '@ALB/Graduate' }));

      const payload = channelSend.mock.calls[0][0];
      expect(payload.content).toContain('I have given them the **Graduate** role');
      expect(payload.content).toContain('in-game');
    });

    // A failed grant must still announce, and say plainly that it needs doing by hand
    it('still announces when the role could not be granted', async () => {
      discordService.getGuildMember = jest.fn().mockRejectedValue(new Error('Missing Permissions'));

      await service.announce(makeVote({ status: AlbionRankUpVoteStatus.PASSED, score: 4, toRank: '@ALB/Graduate' }));

      const payload = channelSend.mock.calls[0][0];
      expect(payload.content).toContain('could not give them');
      expect(payload.content).toContain('Missing Permissions');
    });

    it('never grants a role on a veto, fail or timeout', async () => {
      const grantRank = jest.spyOn(service, 'grantRank');

      await service.announce(makeVote({ status: AlbionRankUpVoteStatus.VETOED }));

      expect(grantRank).not.toHaveBeenCalled();
    });

    it('does not ping on a veto, fail or timeout', async () => {
      for (const status of [
        AlbionRankUpVoteStatus.VETOED,
        AlbionRankUpVoteStatus.FAILED,
        AlbionRankUpVoteStatus.TIMED_OUT,
      ]) {
        channelSend.mockClear();
        await service.announce(makeVote({ status }));

        const payload = channelSend.mock.calls[0][0];
        expect(payload.allowedMentions.roles).toBeUndefined();
      }
    });

    // A crash between resolving and posting must not double announce
    it('posts once even if announce is called twice', async () => {
      execute
        .mockResolvedValueOnce({ affectedRows: 1 })
        .mockResolvedValueOnce({ affectedRows: 0 });

      const vote = makeVote({ status: AlbionRankUpVoteStatus.PASSED });
      await service.announce(vote);
      await service.announce(vote);

      expect(channelSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('reaction entry point', () => {
    const reactionOn = (messageId: string) => ({
      partial: false,
      message: { id: messageId },
      emoji: { name: VOTE_APPROVE },
    } as any);

    const userReacting = (id: string, bot = false) => ({ partial: false, id, bot } as any);

    it('evaluates the vote a tracked ballot belongs to', async () => {
      const vote = makeVote();
      voteRepository.findOne.mockResolvedValue(vote);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.onReactionAdd([reactionOn('msg-1'), userReacting('e1')] as never);

      expect(evaluate).toHaveBeenCalledWith(vote);
    });

    it('ignores reactions on messages that are not ballots', async () => {
      voteRepository.findOne.mockResolvedValue(null);
      const evaluate = jest.spyOn(service, 'evaluate');

      await service.onReactionAdd([reactionOn('some-other-message'), userReacting('e1')] as never);

      expect(evaluate).not.toHaveBeenCalled();
    });

    it('ignores the bot reacting to itself', async () => {
      const evaluate = jest.spyOn(service, 'evaluate');

      await service.onReactionAdd([reactionOn('msg-1'), userReacting('bot', true)] as never);

      expect(voteRepository.findOne).not.toHaveBeenCalled();
      expect(evaluate).not.toHaveBeenCalled();
    });

    it('re-evaluates when a reaction is removed', async () => {
      const vote = makeVote();
      voteRepository.findOne.mockResolvedValue(vote);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.onReactionRemove([reactionOn('msg-1'), userReacting('e1')] as never);

      expect(evaluate).toHaveBeenCalledWith(vote);
    });

    it('does not let a scoring failure escape into the gateway handler', async () => {
      voteRepository.findOne.mockRejectedValue(new Error('db down'));

      await expect(
        service.onReactionAdd([reactionOn('msg-1'), userReacting('e1')] as never),
      ).resolves.toBeUndefined();
    });

    it('only looks at ballots that are still open', async () => {
      voteRepository.findOne.mockResolvedValue(null);

      await service.onReactionAdd([reactionOn('msg-1'), userReacting('e1')] as never);

      expect(voteRepository.findOne).toHaveBeenCalledWith({
        messageId: 'msg-1',
        status: AlbionRankUpVoteStatus.PENDING,
      });
    });
  });

  describe('evaluate failure handling', () => {
    it('abandons the vote when the ballot was deleted', async () => {
      const notFound: any = new Error('Unknown Message');
      notFound.code = 10008;
      discordService.getTextChannel.mockResolvedValue({
        id: 'chan-1',
        send: channelSend,
        messages: { fetch: jest.fn().mockRejectedValue(notFound) },
      });

      await service.evaluate(makeVote());

      expect(execute.mock.calls[0][1][0]).toBe(AlbionRankUpVoteStatus.ABANDONED);
    });

    // A transient outage must not abandon live ballots
    it('leaves the vote pending on a transient Discord failure', async () => {
      const transient: any = new Error('Service Unavailable');
      transient.code = 500;
      discordService.getTextChannel.mockResolvedValue({
        id: 'chan-1',
        send: channelSend,
        messages: { fetch: jest.fn().mockRejectedValue(transient) },
      });

      await service.evaluate(makeVote());

      expect(execute).not.toHaveBeenCalled();
    });
  });
});
