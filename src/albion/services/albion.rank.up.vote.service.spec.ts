/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Collection } from 'discord.js';
import {
  AlbionRankUpVoteService,
  majorityScore,
  PROVISIONAL_HOLD_MS,
  REACTION_DEBOUNCE_MS,
  COUNTDOWN_MARKS,
  RECALCULATING_TICK_MS,
  scoreHeading,
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
import { AlbionRankUpService } from './albion.rank.up.service';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('AlbionRankUpVoteService', () => {
  let service: AlbionRankUpVoteService;
  let voteRepository: any;
  let rankUpService: any;
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
    rankUpService = { renderBallot: jest.fn().mockResolvedValue('RE-RENDERED BALLOT') };
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
        { provide: AlbionRankUpService, useValue: rankUpService },
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

  describe('majorityScore', () => {
    // Strictly more than half. An even electorate needs half plus 0.5, not a whole extra vote.
    it.each([
      [1, 1],
      [2, 1.5],
      [4, 2.5],
      [5, 3],
      [6, 3.5],
      [7, 4],
      [8, 4.5],
    ])('%i voters pass at %d', (electors, expected) => {
      expect(majorityScore(electors)).toBe(expected);
    });

    it('is always more than half the electorate', () => {
      for (let n = 1; n <= 20; n++) {
        expect(majorityScore(n)).toBeGreaterThan(n / 2);
      }
    });
  });

  describe('debouncing a burst of reactions', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    it('recounts once the burst has settled', async () => {
      const vote = makeVote();
      voteRepository.findOne.mockResolvedValue(vote);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.scheduleRecount(vote);
      expect(evaluate).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS);

      expect(evaluate).toHaveBeenCalledTimes(1);
    });

    // The whole point: five electors reacting together produce one tally, not five racing ones
    it('collapses rapid changes into a single recount', async () => {
      const vote = makeVote();
      voteRepository.findOne.mockResolvedValue(vote);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      for (let i = 0; i < 5; i++) {
        await service.scheduleRecount(vote);
        await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS / 2);
      }

      expect(evaluate).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS);

      expect(evaluate).toHaveBeenCalledTimes(1);
    });

    it('debounces each ballot separately', async () => {
      voteRepository.findOne.mockImplementation(async ({ id }: any) => makeVote({ id }));
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.scheduleRecount(makeVote({ id: 1 }));
      await service.scheduleRecount(makeVote({ id: 2 }));
      await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS);

      expect(evaluate).toHaveBeenCalledTimes(2);
    });

    // The wait is long enough for the vote to have been resolved by the cron underneath it
    it('does nothing when the vote resolved while it waited', async () => {
      voteRepository.findOne.mockResolvedValue(null);
      const evaluate = jest.spyOn(service, 'evaluate');

      await service.scheduleRecount(makeVote({ id: 1 }));
      await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS);

      expect(evaluate).not.toHaveBeenCalled();
    });

    it('only ever looks at ballots that are still pending', async () => {
      voteRepository.findOne.mockResolvedValue(null);

      await service.recount(1);

      expect(voteRepository.findOne).toHaveBeenCalledWith({
        id: 1,
        status: AlbionRankUpVoteStatus.PENDING,
      });
    });

    it('does not let a failed recount escape', async () => {
      voteRepository.findOne.mockRejectedValue(new Error('db down'));

      await expect(service.recount(1)).resolves.toBeUndefined();
    });
  });

  describe('re-rendering a live ballot', () => {
    const withBallot = (content: string) => {
      const message = makeMessage({ [VOTE_APPROVE]: ['e1', 'e2'] }, content);
      discordService.getTextChannel = jest.fn().mockResolvedValue({
        id: 'chan-1', send: channelSend, messages: { fetch: jest.fn().mockResolvedValue(message) },
      });
      return message;
    };

    // A ballot posted under older wording is otherwise frozen in it for its whole five days
    it('rewrites the whole ballot on a reaction driven recount', async () => {
      withBallot('OLD FORMAT\nCurrent score: **0** / 4');
      const vote = makeVote();
      voteRepository.findOne.mockResolvedValue(vote);

      await service.evaluate(vote, true);

      expect(rankUpService.renderBallot).toHaveBeenCalledWith(vote, expect.stringContaining('Current score'));
      expect(messageEdit).toHaveBeenCalledWith('RE-RENDERED BALLOT');
    });

    // The sweep runs every minute; rewriting every open ballot that often is a lot of edits
    it('only touches the score line when the sweep drives it', async () => {
      withBallot(scoreHeading(0, 4));

      await service.evaluate(makeVote());

      expect(rankUpService.renderBallot).not.toHaveBeenCalled();
      expect(messageEdit).toHaveBeenCalledWith(scoreHeading(2, 4));
    });

    it('does not edit when the render matches what is already posted', async () => {
      withBallot('RE-RENDERED BALLOT');

      await service.evaluate(makeVote(), true);

      expect(messageEdit).not.toHaveBeenCalled();
    });

    // Losing the render must not cost the score update as well
    it('falls back to the score line when the render fails', async () => {
      withBallot(scoreHeading(0, 4));
      rankUpService.renderBallot.mockRejectedValue(new Error('registration lookup failed'));

      await service.evaluate(makeVote(), true);

      expect(messageEdit).toHaveBeenCalledWith(scoreHeading(2, 4));
    });
  });

  describe('the hold notice', () => {
    const held = (status: AlbionRankUpVoteStatus) => service.scoreLine(makeVote({
      score: 4,
      provisionalStatus: status,
      provisionalSince: new Date(),
    }));

    // Which way the hold is going should read at a glance, not from the verb alone
    it('marks a pending pass with a tick', () => {
      expect(held(AlbionRankUpVoteStatus.PASSED)).toContain('**✅ pass**');
    });

    it('marks a pending veto with the veto emoji', () => {
      expect(held(AlbionRankUpVoteStatus.VETOED)).toContain(`**${VOTE_VETO} be vetoed**`);
    });

    it('states the window and when it closes', () => {
      const line = held(AlbionRankUpVoteStatus.PASSED);

      expect(line).toContain('This vote will be locked in and');
      expect(line).toContain('this is your window to change it');
      expect(line).toMatch(/<t:\d+:R>/);
    });

    it('keeps the score heading above the notice', () => {
      expect(held(AlbionRankUpVoteStatus.PASSED).split('\n')[0]).toBe(scoreHeading(4, 4));
    });

    it('says nothing extra when no hold is running', () => {
      expect(service.scoreLine(makeVote({ score: 2 }))).toBe(scoreHeading(2, 4));
    });
  });

  describe('the recalculating countdown', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => jest.useRealTimers());

    const withBallot = (content = scoreHeading(2.5, 4)) => {
      const message = makeMessage({}, content);
      messageEdit.mockImplementation(async (updated: string) => {
        message.content = updated;
        return message;
      });
      discordService.getTextChannel = jest.fn().mockResolvedValue({
        id: 'chan-1', send: channelSend, messages: { fetch: jest.fn().mockResolvedValue(message) },
      });
      return message;
    };

    const editedLines = () => messageEdit.mock.calls.map((c: any[]) => c[0]);

    // The number is about to move, so it should look unsettled rather than quietly wrong
    it('marks the score the moment a change is detected', async () => {
      withBallot();

      await service.scheduleRecount(makeVote({ score: 2.5 }));

      expect(editedLines()[0]).toContain('recalculating');
      expect(editedLines()[0]).toContain('2.5 / 4');
    });

    // A per-second countdown queued behind Discord's edit limit and lagged the whole burst
    it('spends one edit per countdown mark, not one per second', async () => {
      withBallot();
      await service.scheduleRecount(makeVote({ score: 2.5 }));

      await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS - RECALCULATING_TICK_MS);

      const seconds = editedLines()
        .map((line: string) => line.match(/(\d+)s\)/)?.[1])
        .filter(Boolean)
        .map(Number);

      expect(seconds).toEqual([REACTION_DEBOUNCE_MS / 1000, ...COUNTDOWN_MARKS]);
    });

    // Jitter must not drop a mark: a tick running late steps over it rather than landing on it
    it('paints a mark the ticker stepped over', async () => {
      withBallot();
      await service.scheduleRecount(makeVote({ score: 2.5 }));

      jest.setSystemTime(Date.now() + REACTION_DEBOUNCE_MS - 1500);
      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS);

      expect(editedLines().at(-1)).toContain(`${Math.max(...COUNTDOWN_MARKS)}s)`);
    });

    it('recounts when the countdown runs out, and stops painting', async () => {
      withBallot();
      const vote = makeVote({ score: 2.5 });
      voteRepository.findOne.mockResolvedValue(vote);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.scheduleRecount(vote);
      await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS);
      expect(evaluate).toHaveBeenCalledTimes(1);

      const afterRecount = messageEdit.mock.calls.length;
      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS * 5);

      expect(messageEdit.mock.calls.length).toBe(afterRecount);
      expect(evaluate).toHaveBeenCalledTimes(1);
    });

    // A reaction mid countdown replaces the countdown rather than starting a second ticker
    it('restarts the countdown when another reaction lands', async () => {
      withBallot();
      const vote = makeVote({ score: 2.5 });
      voteRepository.findOne.mockResolvedValue(vote);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.scheduleRecount(vote);
      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS * 3);
      await service.scheduleRecount(vote);
      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS * 3);

      expect(evaluate).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS);

      expect(evaluate).toHaveBeenCalledTimes(1);
    });

    // The replaced ticker kept its own phase, so an extended countdown fired late and off-step
    it('runs the replacement countdown from the reaction that replaced it', async () => {
      withBallot();
      const vote = makeVote({ score: 2.5 });
      voteRepository.findOne.mockResolvedValue(vote);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.scheduleRecount(vote);
      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS * 3);
      await service.scheduleRecount(vote);

      // The original deadline has now passed, and must not be what fires
      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS * 3);
      expect(evaluate).not.toHaveBeenCalled();

      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS * 2);
      expect(evaluate).toHaveBeenCalledTimes(1);
    });

    // One fetch per burst, not one per tick - the countdown must not cost a REST call a second
    it('fetches the ballot once for the whole countdown', async () => {
      withBallot();
      await service.scheduleRecount(makeVote({ score: 2.5 }));
      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS * 3);

      const channel = await discordService.getTextChannel();
      expect(channel.messages.fetch).toHaveBeenCalledTimes(1);
    });

    // Replacing must not cost a REST call either - the fetched ballot carries across
    it('reuses the fetched ballot when the countdown is replaced', async () => {
      withBallot();
      const vote = makeVote({ score: 2.5 });

      await service.scheduleRecount(vote);
      await jest.advanceTimersByTimeAsync(RECALCULATING_TICK_MS * 3);
      await service.scheduleRecount(vote);

      const channel = await discordService.getTextChannel();
      expect(channel.messages.fetch).toHaveBeenCalledTimes(1);
    });

    // Otherwise the old paint lands after the new one and the ballot shows the wrong time left
    it('discards a paint from a countdown that was replaced mid flight', async () => {
      const message = makeMessage({}, scoreHeading(2.5, 4));
      messageEdit.mockImplementation(async (updated: string) => {
        message.content = updated;
        return message;
      });

      const waiting: Array<(m: any) => void> = [];
      const slowFetch = jest.fn().mockImplementation(() => new Promise((resolve) => waiting.push(resolve)));
      discordService.getTextChannel = jest.fn().mockResolvedValue({
        id: 'chan-1', send: channelSend, messages: { fetch: slowFetch },
      });

      const vote = makeVote({ score: 2.5 });
      const stalled = service.scheduleRecount(vote); // Blocks on its fetch
      await Promise.resolve();
      const replacement = service.scheduleRecount(vote); // Replaces it, blocks on its own
      await Promise.resolve();

      waiting[0](message); // The replaced countdown comes back first
      await stalled;
      expect(messageEdit).not.toHaveBeenCalled();

      waiting[1](message);
      await replacement;
      expect(messageEdit).toHaveBeenCalledTimes(1);
    });

    it('clears the marker when the recount lands', async () => {
      withBallot(scoreHeading(2.5, 4, 5));
      const vote = makeVote({ score: 2.5 });
      voteRepository.findOne.mockResolvedValue(vote);

      await service.recount(vote.id);

      expect(editedLines().at(-1)).not.toContain('recalculating');
    });

    it('does not let a failed repaint stop the recount', async () => {
      discordService.getTextChannel = jest.fn().mockRejectedValue(new Error('discord down'));
      const vote = makeVote();
      voteRepository.findOne.mockResolvedValue(vote);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.scheduleRecount(vote);
      await jest.advanceTimersByTimeAsync(REACTION_DEBOUNCE_MS);

      expect(evaluate).toHaveBeenCalled();
    });
  });

  describe('resyncPending', () => {
    // The debounce timer is in process, so a restart loses any recount it was holding
    it('re-evaluates every open ballot that was posted', async () => {
      const votes = [makeVote({ id: 1 }), makeVote({ id: 2 })];
      voteRepository.find.mockResolvedValue(votes);
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.resyncPending();

      expect(evaluate).toHaveBeenCalledTimes(2);
    });

    it('skips ballots that were never posted', async () => {
      voteRepository.find.mockResolvedValue([]);

      await service.resyncPending();

      expect(voteRepository.find).toHaveBeenCalledWith({
        status: AlbionRankUpVoteStatus.PENDING,
        messageId: { $ne: null },
      });
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

    it('schedules a recount for the ballot the reaction belongs to', async () => {
      const vote = makeVote();
      voteRepository.findOne.mockResolvedValue(vote);
      const schedule = jest.spyOn(service, 'scheduleRecount').mockImplementation(() => undefined);

      await service.onReactionAdd([reactionOn('msg-1'), userReacting('e1')] as never);

      expect(schedule).toHaveBeenCalledWith(vote);
    });

    // Tallying on each event lands a count taken mid-change; the burst has to settle first
    it('does not recount straight away', async () => {
      voteRepository.findOne.mockResolvedValue(makeVote());
      const evaluate = jest.spyOn(service, 'evaluate').mockResolvedValue(undefined);

      await service.onReactionAdd([reactionOn('msg-1'), userReacting('e1')] as never);

      expect(evaluate).not.toHaveBeenCalled();
    });

    it('ignores reactions on messages that are not ballots', async () => {
      voteRepository.findOne.mockResolvedValue(null);
      const schedule = jest.spyOn(service, 'scheduleRecount');

      await service.onReactionAdd([reactionOn('some-other-message'), userReacting('e1')] as never);

      expect(schedule).not.toHaveBeenCalled();
    });

    it('ignores the bot reacting to itself', async () => {
      const schedule = jest.spyOn(service, 'scheduleRecount');

      await service.onReactionAdd([reactionOn('msg-1'), userReacting('bot', true)] as never);

      expect(voteRepository.findOne).not.toHaveBeenCalled();
      expect(schedule).not.toHaveBeenCalled();
    });

    it('re-evaluates when a reaction is removed', async () => {
      const vote = makeVote();
      voteRepository.findOne.mockResolvedValue(vote);
      const schedule = jest.spyOn(service, 'scheduleRecount').mockImplementation(() => undefined);

      await service.onReactionRemove([reactionOn('msg-1'), userReacting('e1')] as never);

      expect(schedule).toHaveBeenCalledWith(vote);
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
