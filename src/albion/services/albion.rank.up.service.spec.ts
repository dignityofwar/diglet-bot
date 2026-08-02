/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { UniqueConstraintViolationException } from '@mikro-orm/core';
import { UNPOSTED_GRACE_MS } from './albion.ballot.text';
import { AlbionRankUpService, RankUpRefusal } from './albion.rank.up.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import {
  AlbionRankUpVoteEntity,
  AlbionRankUpVoteStatus,
} from '../../database/entities/albion.rank.up.vote.entity';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { DiscordService } from '../../discord/discord.service';
import { MemberActivityRollupService } from '../../general/services/member.activity.rollup.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('AlbionRankUpService', () => {
  let service: AlbionRankUpService;
  let registrationsRepository: any;
  let voteRepository: any;
  let albionUtilities: any;
  let rollupService: any;
  let votePersist: jest.Mock;
  let voteFlush: jest.Mock;
  let voteExecute: jest.Mock;
  let channelSend: jest.Mock;
  let registrationsExecute: jest.Mock;
  let ballotMessage: any;
  let configService: ConfigService;
  let discordService: any;

  const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

  // What MikroORM actually throws when the pendingKey index rejects a second open ballot
  const duplicateKeyError = () => new UniqueConstraintViolationException(
    new Error('Duplicate entry \'candidate\' for key \'albion_rank_up_vote_entity_pending_key_unique\''),
  );

  const makeRegistration = (overrides: any = {}) => ({
    id: 1,
    discordId: 'candidate',
    characterId: 'char-1',
    characterName: 'Testy',
    guildId: '6567576868',
    createdAt: daysAgo(30),
    graduateSince: null,
    adeptSince: null,
    lastDenialNoticeAt: null,
    ...overrides,
  });

  const disciple = { name: '@ALB/Disciple', discordRoleId: 'd', priority: 6, keep: false };
  const graduate = { name: '@ALB/Graduate', discordRoleId: 'g', priority: 5, keep: true };
  const adept = { name: '@ALB/Adept', discordRoleId: 'a', priority: 4, keep: false };

  const member: any = { id: 'candidate', displayName: 'Testy', guild: { id: 'guild-1' } };

  beforeEach(async () => {
    channelSend = jest.fn().mockImplementation(async () => ballotMessage);
    ballotMessage = {
      id: 'msg-1',
      react: jest.fn().mockResolvedValue(true),
      delete: jest.fn().mockResolvedValue(true),
    };
    registrationsExecute = jest.fn().mockResolvedValue({ affectedRows: 1 });

    registrationsRepository = {
      findOne: jest.fn().mockResolvedValue(makeRegistration()),
      getEntityManager: jest.fn().mockReturnValue({
        persist: jest.fn().mockReturnThis(),
        flush: jest.fn().mockResolvedValue(true),
        getConnection: jest.fn().mockReturnValue({ execute: registrationsExecute }),
      }),
    };

    votePersist = jest.fn().mockReturnThis();
    voteFlush = jest.fn().mockResolvedValue(true);
    voteExecute = jest.fn().mockResolvedValue({ affectedRows: 1 });

    voteRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      getEntityManager: jest.fn().mockReturnValue({
        persist: votePersist,
        flush: voteFlush,
        getConnection: jest.fn().mockReturnValue({ execute: voteExecute }),
      }),
    };

    albionUtilities = {
      getHighestAlbionRole: jest.fn().mockReturnValue(disciple),
      getElectors: jest.fn().mockResolvedValue(
        ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'].map((id) => ({ id })),
      ),
    };

    rollupService = {
      getRollup: jest.fn().mockResolvedValue([]),
      getGameTotals: jest.fn().mockResolvedValue([]),
      getTrackingStartDate: jest.fn().mockResolvedValue(daysAgo(10)),
    };

    discordService = {
      getTextChannel: jest.fn().mockResolvedValue({
        id: 'judgement-hall',
        isTextBased: () => true,
        send: channelSend,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRankUpService,
        ConfigService,
        { provide: DiscordService, useValue: discordService },
        { provide: AlbionUtilities, useValue: albionUtilities },
        { provide: MemberActivityRollupService, useValue: rollupService },
        { provide: getRepositoryToken(AlbionRegistrationsEntity), useValue: registrationsRepository },
        { provide: getRepositoryToken(AlbionRankUpVoteEntity), useValue: voteRepository },
      ],
    }).compile();

    TestBootstrapper.setupConfig(module);
    configService = module.get<ConfigService>(ConfigService);
    service = module.get<AlbionRankUpService>(AlbionRankUpService);
    await service.onApplicationBootstrap();
  });

  const lastSentContent = () => channelSend.mock.calls[channelSend.mock.calls.length - 1][0].content;

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('bootstrap', () => {
    // getTextChannel(undefined) fails with "undefined is not a snowflake", which is a Discord
    // error for what is really a missing environment variable
    it('names the environment variable when the channel is not configured', async () => {
      jest.spyOn(configService, 'get').mockImplementation((key: string) =>
        (key === 'discord.channels.judgementHall' ? undefined : TestBootstrapper.mockConfig.discord.channels));

      await expect(service.onApplicationBootstrap())
        .rejects.toThrow('CHANNEL_ALBION_JUDGEMENT_HALL is not set');
    });

    it('refuses when the channel ID does not resolve to a channel', async () => {
      discordService.getTextChannel.mockResolvedValue(null);

      await expect(service.onApplicationBootstrap()).rejects.toThrow('Could not find the Judgement Hall channel');
    });

    it('refuses when the channel is not text based', async () => {
      discordService.getTextChannel.mockResolvedValue({ id: 'x', isTextBased: () => false });

      await expect(service.onApplicationBootstrap()).rejects.toThrow('is not a text channel');
    });
  });

  // A failed bootstrap only logs - Nest carries on booting - so the service stays half built
  describe('when the Judgement Hall channel never resolved', () => {
    beforeEach(() => {
      (service as any).judgementHall = undefined;
    });

    it('refuses with a message naming the cause', async () => {
      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('vote channel is not configured');
    });

    it('does not reach the database', async () => {
      await service.handleRankUpRequest(member);

      expect(registrationsRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('registration gate', () => {
    it('refuses outright when there is no registration', async () => {
      registrationsRepository.findOne.mockResolvedValue(null);

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('not registered');
      expect(outcome.reply).toContain('/albion-register');
    });

    // Runs before the rank lookup, so an unregistered member holding a role still gets this
    it('checks registration before the rank', async () => {
      registrationsRepository.findOne.mockResolvedValue(null);

      await service.handleRankUpRequest(member);

      expect(albionUtilities.getHighestAlbionRole).not.toHaveBeenCalled();
    });

    it('posts a denial notice naming no tier', async () => {
      registrationsRepository.findOne.mockResolvedValue(null);

      await service.handleRankUpRequest(member);

      expect(lastSentContent()).toContain('no Albion registration');
    });
  });

  describe('rank gate', () => {
    it('refuses a rank with no member-initiated path', async () => {
      albionUtilities.getHighestAlbionRole.mockReturnValue(adept);

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.reply).toContain('does not apply to your current rank');
    });

    it('refuses a member with no Albion role at all', async () => {
      albionUtilities.getHighestAlbionRole.mockReturnValue(null);

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
    });
  });

  describe('tier 1 - Disciple to Graduate', () => {
    it('refuses on day 13', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(13) }));

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('not been with us long enough');
    });

    // The whole point of the refusal is telling them when to come back, rendered in the
    // reader's own timezone rather than a date we have to format ourselves
    it('tells them exactly when they become eligible, as a Discord timestamp', async () => {
      const registeredAt = daysAgo(13);
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: registeredAt }));

      const outcome = await service.handleRankUpRequest(member);

      const eligibleAt = Math.floor((registeredAt.getTime() + 14 * DAY_MS) / 1000);
      expect(outcome.reply).toContain(`<t:${eligibleAt}:R>`); // "in 24 hours"
      expect(outcome.reply).toContain(`<t:${eligibleAt}:F>`); // "Sunday, 16 August 2026 14:32"
    });

    it('gives the same eligibility date on the tier 2 gate', async () => {
      albionUtilities.getHighestAlbionRole.mockReturnValue(graduate);
      const graduatedAt = daysAgo(27);
      registrationsRepository.findOne.mockResolvedValue(
        makeRegistration({ createdAt: daysAgo(300), graduateSince: graduatedAt }),
      );

      const outcome = await service.handleRankUpRequest(member);

      const eligibleAt = Math.floor((graduatedAt.getTime() + 28 * DAY_MS) / 1000);
      expect(outcome.reply).toContain(`<t:${eligibleAt}:R>`);
      expect(outcome.reply).toContain(`<t:${eligibleAt}:F>`);
    });

    it('accepts on day 14', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(14) }));

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(true);
    });

    it('sends only the one-liner when refused, never the ballot', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(2) }));

      await service.handleRankUpRequest(member);

      expect(channelSend).toHaveBeenCalledTimes(1);
      expect(lastSentContent()).toContain('attempted to rank up');
      expect(lastSentContent()).not.toContain('Please react with the following');
    });
  });

  describe('tier 2 - Graduate to Adept', () => {
    beforeEach(() => {
      albionUtilities.getHighestAlbionRole.mockReturnValue(graduate);
    });

    it('refuses on day 27 of being a Graduate', async () => {
      registrationsRepository.findOne.mockResolvedValue(
        makeRegistration({ createdAt: daysAgo(300), graduateSince: daysAgo(27) }),
      );

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
    });

    it('accepts on day 28 of being a Graduate', async () => {
      registrationsRepository.findOne.mockResolvedValue(
        makeRegistration({ createdAt: daysAgo(300), graduateSince: daysAgo(28) }),
      );

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(true);
    });

    // Falling back to the registration date would clear the gate the day they became a Graduate
    it('refuses rather than falling back to the registration date', async () => {
      registrationsRepository.findOne.mockResolvedValue(
        makeRegistration({ createdAt: daysAgo(300), graduateSince: null }),
      );

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('when you became a Graduate');
    });
  });

  describe('failed vote lockout', () => {
    const resolvedVote = (status: AlbionRankUpVoteStatus, resolvedAt: Date) => ({
      id: 9,
      discordId: 'candidate',
      status,
      resolvedAt,
    });

    it.each([
      AlbionRankUpVoteStatus.FAILED,
      AlbionRankUpVoteStatus.TIMED_OUT,
      AlbionRankUpVoteStatus.VETOED,
    ])('locks out for a week after a %s vote', async (status) => {
      voteRepository.findOne.mockResolvedValue(resolvedVote(status, daysAgo(3)));

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('did not pass');
    });

    it('gives the exact date they may ask again as a Discord timestamp', async () => {
      const resolvedAt = daysAgo(3);
      voteRepository.findOne.mockResolvedValue(resolvedVote(AlbionRankUpVoteStatus.FAILED, resolvedAt));

      const outcome = await service.handleRankUpRequest(member);

      const nextAllowed = Math.floor((resolvedAt.getTime() + 7 * DAY_MS) / 1000);
      expect(outcome.reply).toContain(`<t:${nextAllowed}:R>`);
      expect(outcome.reply).toContain(`<t:${nextAllowed}:F>`);
    });

    it('allows a new request once the week is up', async () => {
      // The query itself filters on resolvedAt, so an expired lockout returns nothing
      voteRepository.findOne.mockResolvedValue(null);

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(true);
    });

    it('only looks at outcomes that went against them, inside the window', async () => {
      await service.handleRankUpRequest(member);

      const query = voteRepository.findOne.mock.calls[0][0];
      expect(query.discordId).toBe('candidate');
      expect(query.status.$in).toEqual([
        AlbionRankUpVoteStatus.FAILED,
        AlbionRankUpVoteStatus.TIMED_OUT,
        AlbionRankUpVoteStatus.VETOED,
      ]);
      expect(query.resolvedAt.$gte).toBeInstanceOf(Date);
    });

    // A ballot that vanished or could not be posted is our problem, not the candidate's
    it('does not lock out after an abandoned ballot', async () => {
      expect([
        AlbionRankUpVoteStatus.FAILED,
        AlbionRankUpVoteStatus.TIMED_OUT,
        AlbionRankUpVoteStatus.VETOED,
      ]).not.toContain(AlbionRankUpVoteStatus.ABANDONED);
    });

    // Keyed off the vote's resolution, so a first-time candidate can never be caught by it
    it('never delays a first request on the day they become eligible', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(14) }));
      voteRepository.findOne.mockResolvedValue(null);

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(true);
    });

    it('tells them they are too new before mentioning a lockout', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(2) }));
      voteRepository.findOne.mockResolvedValue(resolvedVote(AlbionRankUpVoteStatus.FAILED, daysAgo(1)));

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.reply).toContain('not been with us long enough');
    });
  });

  describe('reclaimUnposted', () => {
    it('only touches pending rows that never got a message', async () => {
      await service.reclaimUnposted();

      expect(voteExecute.mock.calls[0][0]).toContain('message_id is null');
      expect(voteExecute.mock.calls[0][0]).toContain('status = ?');
      expect(voteExecute.mock.calls[0][1]).toContain(AlbionRankUpVoteStatus.ABANDONED);
    });

    it('frees the pending key so the member can ask again', async () => {
      await service.reclaimUnposted();

      expect(voteExecute.mock.calls[0][0]).toContain('pending_key = null');
    });

    // Otherwise the reconcile sweep would try to post an outcome for a ballot nobody ever saw
    it('marks the row announced so nothing tries to post an outcome', async () => {
      await service.reclaimUnposted();

      expect(voteExecute.mock.calls[0][0]).toContain('announced_at = ?');
    });

    // Only bounds how recent a claim can be and still be reclaimed. It does not prove a
    // concurrent publish is safe - trackBallot()'s conditional write is what does that.
    it('only considers claims older than the grace window', async () => {
      await service.reclaimUnposted();

      const cutoff: Date = voteExecute.mock.calls[0][1].at(-1);
      expect(Date.now() - cutoff.getTime()).toBeGreaterThanOrEqual(UNPOSTED_GRACE_MS);
    });

    it('narrows to one member when given a discord ID', async () => {
      await service.reclaimUnposted('candidate');

      expect(voteExecute.mock.calls[0][0]).toContain('and discord_id = ?');
      expect(voteExecute.mock.calls[0][1].at(-1)).toBe('candidate');
    });

    it('reports how many it reclaimed', async () => {
      voteExecute.mockResolvedValue({ affectedRows: 2 });

      expect(await service.reclaimUnposted()).toBe(2);
    });

    it('asks for the affected row count', async () => {
      await service.reclaimUnposted();

      expect(voteExecute.mock.calls[0][2]).toBe('run');
    });
  });

  describe('denial notice throttle', () => {
    it('claims the throttle by conditional update before sending', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(2) }));

      await service.handleRankUpRequest(member);

      expect(registrationsExecute.mock.calls[0][0]).toContain('last_denial_notice_at is null or last_denial_notice_at <');
      expect(channelSend).toHaveBeenCalledTimes(1);
    });

    // Without 'run' the driver returns rows, so the UPDATE comes back as [] and the claim always
    // reads as lost - no denial notice would ever reach Judgement Hall
    it('asks for the affected row count', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(2) }));

      await service.handleRankUpRequest(member);

      expect(registrationsExecute.mock.calls[0][2]).toBe('run');
    });

    it('stays silent when the claim matches no rows', async () => {
      registrationsExecute.mockResolvedValue({ affectedRows: 0 });
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(2) }));

      const outcome = await service.handleRankUpRequest(member);

      // The member still gets their private answer, only the public line is suppressed
      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('not been with us long enough');
      expect(channelSend).not.toHaveBeenCalled();
    });

    // Ineligible, locked out and already-open all go through the same throttle
    it.each([
      ['ineligible', () => {
        registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(2) }));
      }],
      ['locked out', () => {
        voteRepository.findOne.mockResolvedValue({
          id: 9, discordId: 'candidate', status: AlbionRankUpVoteStatus.FAILED, resolvedAt: daysAgo(1),
        });
      }],
      ['already open', () => {
        voteRepository.getEntityManager.mockReturnValue({
          persist: jest.fn().mockReturnThis(),
          flush: jest.fn().mockRejectedValue(new Error('Duplicate entry for key pending_key')),
        });
      }],
    ])('still answers a %s member privately while suppressing the repeat post', async (_label, setup) => {
      setup();
      registrationsExecute.mockResolvedValue({ affectedRows: 0 });

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).not.toBe('');
      expect(channelSend).not.toHaveBeenCalled();
    });

    // No registration row means no column to throttle against, so this is held in memory
    it('throttles the unregistered case too', async () => {
      registrationsRepository.findOne.mockResolvedValue(null);

      const first = await service.handleRankUpRequest(member);
      const second = await service.handleRankUpRequest(member);

      expect(first.reply).toContain('not registered');
      expect(second.reply).toContain('not registered');
      expect(channelSend).toHaveBeenCalledTimes(1);
    });
  });

  describe('publishing', () => {
    it('records the ballot before posting it', async () => {
      const order: string[] = [];
      voteRepository.getEntityManager.mockReturnValue({
        persist: jest.fn().mockReturnThis(),
        flush: jest.fn().mockImplementation(async () => { order.push('flush'); }),
      });
      channelSend.mockImplementation(async () => {
        order.push('send');
        return ballotMessage;
      });

      await service.handleRankUpRequest(member);

      expect(order[0]).toBe('flush');
    });

    it('refuses when a ballot is already open', async () => {
      voteFlush.mockRejectedValue(duplicateKeyError());

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.reply).toContain('already have a rank up vote open');
      expect(channelSend).not.toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('wants to be ranked up'),
      }));
    });

    // The bug this replaced: any insert failure was reported as an open ballot, so a missing
    // table or a bad column read as "you already have a vote" with nothing in the table
    it('does not claim a ballot is open when the insert failed for another reason', async () => {
      voteFlush.mockRejectedValue(new Error('Table albion_rank_up_vote_entity does not exist'));

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).not.toContain('already have a rank up vote open');
      expect(outcome.reply).toContain('Something went wrong');
    });

    it('does not post a ballot when the insert failed for another reason', async () => {
      voteFlush.mockRejectedValue(new Error('Table albion_rank_up_vote_entity does not exist'));

      await service.handleRankUpRequest(member);

      expect(channelSend).not.toHaveBeenCalledWith(expect.objectContaining({
        content: expect.stringContaining('wants to be ranked up'),
      }));
    });

    // A claim left behind by an attempt that died before posting is ours to clear, not a
    // reason to lock the member out of a ballot nobody ever saw
    it('reclaims a ballot that was never posted and retries', async () => {
      const reclaimSpy = jest.spyOn(service, 'reclaimUnposted');
      voteFlush.mockRejectedValueOnce(duplicateKeyError());
      reclaimSpy.mockResolvedValue(1);

      const outcome = await service.handleRankUpRequest(member);

      expect(reclaimSpy).toHaveBeenCalledWith('candidate');
      expect(outcome.ok).toBe(true);
      expect(lastSentContent()).toContain('wants to be ranked up');
    });

    it('refuses when there was nothing stranded to reclaim', async () => {
      const reclaimSpy = jest.spyOn(service, 'reclaimUnposted');
      voteFlush.mockRejectedValue(duplicateKeyError());
      reclaimSpy.mockResolvedValue(0);

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.reply).toContain('already have a rank up vote open');
    });

    it('releases the claim when the ballot cannot be posted', async () => {
      channelSend.mockRejectedValue(new Error('missing permissions'));

      const outcome = await service.handleRankUpRequest(member);

      const ballot = votePersist.mock.calls.at(-1)[0];
      expect(ballot.status).toBe(AlbionRankUpVoteStatus.ABANDONED);
      expect(ballot.pendingKey).toBeNull();
      expect(outcome.reply).toContain('Could not post your rank up request');
    });

    // The cleanup escaping would strand the very claim it exists to release
    it('does not throw when releasing the claim also fails', async () => {
      channelSend.mockRejectedValue(new Error('missing permissions'));
      voteFlush.mockResolvedValueOnce(true).mockRejectedValue(new Error('db unreachable'));

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('Could not post your rank up request');
    });

    it('still refuses when the orphaned ballot cannot be removed', async () => {
      voteExecute.mockResolvedValue({ affectedRows: 0 });
      ballotMessage.delete.mockRejectedValue(new Error('already gone'));

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('try again');
    });

    it('records the message ID only while it still owns the claim', async () => {
      await service.handleRankUpRequest(member);

      const track = voteExecute.mock.calls.find((c: any[]) => c[0].includes('set message_id = ?'));
      expect(track[0]).toContain('message_id is null');
      expect(track[2]).toBe('run');
    });

    // The sweep can reclaim a claim while the send is in flight. The post is then an orphan
    // nothing will ever resolve, so it has to come back down rather than collect votes.
    it('removes a ballot that was reclaimed while it was being posted', async () => {
      voteExecute.mockResolvedValue({ affectedRows: 0 });

      const outcome = await service.handleRankUpRequest(member);

      expect(ballotMessage.delete).toHaveBeenCalled();
      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('try again');
    });

    it('leaves the ballot up when it cannot tell whether it still owns it', async () => {
      voteExecute.mockRejectedValue(new Error('db unreachable'));

      const outcome = await service.handleRankUpRequest(member);

      // Taking down a ballot leadership may already be voting on is the worse mistake
      expect(ballotMessage.delete).not.toHaveBeenCalled();
      expect(outcome.ok).toBe(true);
    });

    // Anything failing after the row is claimed but before the send strands the member behind a
    // ballot that was never posted, so the report has to be built first
    it('does not claim a ballot when the activity report cannot be built', async () => {
      rollupService.getRollup.mockRejectedValue(new Error('activity table is missing'));

      await expect(service.handleRankUpRequest(member)).rejects.toThrow('activity table is missing');
      expect(votePersist).not.toHaveBeenCalled();
    });

    it('adds all four reactions in order', async () => {
      await service.handleRankUpRequest(member);

      expect(ballotMessage.react.mock.calls.map((c: any[]) => c[0])).toEqual(['👍', '🤷', '👎', '⛔']);
    });

    it('still succeeds when a reaction fails to attach', async () => {
      ballotMessage.react.mockRejectedValue(new Error('rate limited'));

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(true);
    });

    it('refuses when there is nobody to vote', async () => {
      albionUtilities.getElectors.mockResolvedValue([]);

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(false);
      expect(outcome.reply).toContain('no leadership were found');
      expect(channelSend).not.toHaveBeenCalledWith(
        expect.objectContaining({ content: expect.stringContaining('Please react') }),
      );
    });
  });

  describe('the ballot', () => {
    // An even electorate is where the majority rule bites: 6 passes at 3.5, not 4
    it('sets the bar at a true majority for an even electorate', async () => {
      albionUtilities.getElectors.mockResolvedValue(
        ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => ({ id })),
      );

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('Eligible voters: 6');
      expect(content).toContain('Passes at a score of **3.5** — a majority of 6 (6 ÷ 2 = 3) + 0.5');
      expect(content).toContain('## 📊 Current score: 0 / 3.5');
    });

    it('freezes the majority on the row, not just the message', async () => {
      albionUtilities.getElectors.mockResolvedValue(
        ['e1', 'e2', 'e3', 'e4', 'e5', 'e6'].map((id) => ({ id })),
      );

      await service.handleRankUpRequest(member);

      expect(votePersist.mock.calls[0][0].requiredScore).toBe(3.5);
    });

    it('states the electorate, threshold and starting score', async () => {
      await service.handleRankUpRequest(member);

      const content = lastSentContent();
      expect(content).toContain('Eligible voters: 7');
      expect(content).toContain('Passes at a score of **4** — a majority of 7 (7 ÷ 2 = 3.5) + 0.5');
      expect(content).toContain('## 📊 Current score: 0 / 4');
    });

    it('keeps the wording leadership already use', async () => {
      await service.handleRankUpRequest(member);

      const content = lastSentContent();
      expect(content).toContain('wants to be ranked up');
      expect(content).toContain('Please react with the following');
      expect(content).toContain('- ⛔ veto the rank up (this action needs justification with proof), this will cause the vote to fail within 1 hour.');
    });

    it('bullets each reaction explainer but keeps the scoring on one line', async () => {
      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      for (const line of [
        '- 👍 to approve the rank up',
        '- 🤷 to say "I don\'t know the person well enough"',
        '- 👎 to disapprove the rank up',
        '- ⛔ veto the rank up (this action needs justification with proof), this will cause the vote to fail within 1 hour.',
      ]) {
        expect(content).toContain(line);
      }

      expect(content).toContain('Scoring: 👍 = 1 point · 🤷 = 0.5 points · 👎 = 0 points\n');
    });

    it('pings the leadership role and the candidate only', async () => {
      await service.handleRankUpRequest(member);

      const payload = channelSend.mock.calls[0][0];
      expect(payload.content).toContain('<@&1421034165356331070>');
      expect(payload.allowedMentions).toEqual({
        roles: ['1421034165356331070'],
        users: ['candidate'],
      });
    });

    it('shows Albion Online at zero when the member has some game data', async () => {
      rollupService.getGameTotals.mockResolvedValue([{ gameName: 'Foxhole', minutes: 60 }]);

      await service.handleRankUpRequest(member);

      expect(lastSentContent()).toContain('Albion Online: 0h 0m');
    });

    // "0h 0m" reads as "played none", which is a different claim from "we recorded nothing"
    it('says nothing was recorded rather than showing zero hours', async () => {
      rollupService.getRollup.mockResolvedValue([{ messagesSent: 3, reactionsAdded: 0, voiceMinutes: 0, date: daysAgo(1) }]);
      rollupService.getGameTotals.mockResolvedValue([]);

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('No game activity recorded');
      expect(content).not.toContain('Albion Online: 0h 0m');
    });

    // A brand new member has no rows at all. Zeroes plus a red band would read as a verdict.
    it('states there is no data rather than reporting a member as inactive', async () => {
      rollupService.getRollup.mockResolvedValue([]);
      rollupService.getGameTotals.mockResolvedValue([]);

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('No activity data recorded for this member');
      expect(content).not.toContain('Activity all time');
      expect(content).not.toContain('Messages:');
    });

    it('still names the character and registration date when there is no activity data', async () => {
      rollupService.getRollup.mockResolvedValue([]);
      rollupService.getGameTotals.mockResolvedValue([]);

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('Guildmember **Testy** (<@candidate>)');
      expect(content).toContain('📅 Registered:');
    });

    // The character is the thing leadership recognises, so it leads rather than sitting in stats
    it('names the character and the member on the opening line', async () => {
      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('Guildmember **Testy** (<@candidate>) wants to be ranked up');
      expect(content).not.toContain('**Character:**');
    });

    // The vote is about Albion. Listing what else someone plays invites judging them on it.
    it('reports Albion only, never the other games recorded', async () => {
      rollupService.getGameTotals.mockResolvedValue([
        { gameName: 'Albion Online', minutes: 600 },
        { gameName: 'Foxhole', minutes: 300 },
        { gameName: 'Noita', minutes: 30 },
      ]);

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('Albion Online: 10h 0m');
      expect(content).not.toContain('Foxhole');
      expect(content).not.toContain('Noita');
      expect(content).not.toContain('Other games');
    });

    it('heads the block Metrics and bullets the dates with the rest', async () => {
      rollupService.getRollup.mockResolvedValue([{ messagesSent: 5, reactionsAdded: 2, voiceMinutes: 60, date: daysAgo(1) }]);

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('### Metrics');
      expect(content).toMatch(/- 📅 Registered:.*30\*\* days ago/);
    });

    // A year-long member absent for a fortnight and a brand new one look identical on a
    // lifetime average, which is the figure leadership would otherwise vote on
    it('reports activity all time and over the last two weeks', async () => {
      rollupService.getRollup.mockResolvedValue([
        { messagesSent: 5, reactionsAdded: 0, voiceMinutes: 0, date: daysAgo(1) },
        { messagesSent: 3, reactionsAdded: 0, voiceMinutes: 0, date: daysAgo(40) },
        { messagesSent: 0, reactionsAdded: 0, voiceMinutes: 0, date: daysAgo(41) },
      ]);
      rollupService.getTrackingStartDate.mockResolvedValue(daysAgo(60));

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('📊 Activity all time registered: **2** of');
      expect(content).toContain('📈 Activity last 14 days: **1** of **14** days (7%)');
    });

    it('does not let the recent window claim more days than have been tracked', async () => {
      rollupService.getRollup.mockResolvedValue([
        { messagesSent: 5, reactionsAdded: 0, voiceMinutes: 0, date: daysAgo(1) },
      ]);
      rollupService.getTrackingStartDate.mockResolvedValue(daysAgo(3));

      await service.handleRankUpRequest(member);

      expect(lastSentContent()).toContain('📈 Activity last 14 days: **1** of **3** days');
    });

    // The stats are server wide, and reading them as Albion-only would undercount everyone
    it('marks the server wide counters against their footnote', async () => {
      rollupService.getRollup.mockResolvedValue([{ messagesSent: 5, reactionsAdded: 2, voiceMinutes: 60, date: daysAgo(1) }]);

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toMatch(/🎙️ Voice:.*²/);
      expect(content).toMatch(/💬 Messages:.*²/);
      expect(content).toMatch(/⭐ Reactions:.*²/);
      expect(content).toContain('² Monitored across the entire DIG server, not filtered by Albion section.');
    });

    it('marks the game figures against the presence footnote', async () => {
      rollupService.getGameTotals.mockResolvedValue([{ gameName: 'Albion Online', minutes: 120 }]);

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toMatch(/⚔️.*¹/);
      expect(content).toContain('¹ Game time is sampled from Discord presence');
    });

    it('carries both the tracking and presence caveats', async () => {
      await service.handleRankUpRequest(member);

      const content = lastSentContent();
      expect(content).toContain('Activity tracking began');
      expect(content).toContain('game activity sharing enabled');
    });
  });

  describe('activityBand', () => {
    it.each([
      [8, 10, '🟢 Very active'],
      [75, 100, '🟢 Very active'],
      [5, 10, '🟡 Active'],
      [3, 10, '🟠 Occasional'],
      [1, 10, '🔴 Low'],
      [0, 10, '🔴 Low'],
    ])('%i of %i days is %s', (active, tracked, expected) => {
      expect(service.activityBand(active, tracked)).toBe(expected);
    });

    it('does not divide by zero', () => {
      expect(service.activityBand(0, 0)).toBe('🔴 Low');
    });
  });

  describe('denialNoticeLine', () => {
    it('names the tier when there is one', () => {
      const line = service.denialNoticeLine(
        'candidate',
        { from: '@ALB/Disciple', to: '@ALB/Graduate', windowDays: 14 },
        RankUpRefusal.TOO_NEW,
        daysAgo(-2),
      );

      expect(line).toContain('Disciple → Graduate');
      expect(line).toContain('too new');
    });

    it('omits the tier when the member is not registered', () => {
      const line = service.denialNoticeLine('candidate', null, RankUpRefusal.NOT_REGISTERED);

      expect(line).toContain('attempted to rank up —');
      expect(line).not.toContain('→');
    });
  });
});
