/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionRankUpService, RankUpRefusal } from './albion.rank.up.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionRankUpVoteEntity } from '../../database/entities/albion.rank.up.vote.entity';
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
  let channelSend: jest.Mock;
  let registrationsExecute: jest.Mock;
  let ballotMessage: any;

  const daysAgo = (days: number) => new Date(Date.now() - days * DAY_MS);

  const makeRegistration = (overrides: any = {}) => ({
    id: 1,
    discordId: 'candidate',
    characterId: 'char-1',
    characterName: 'Testy',
    guildId: '6567576868',
    createdAt: daysAgo(30),
    graduateSince: null,
    adeptSince: null,
    lastRankUpRequestAt: null,
    lastDenialNoticeAt: null,
    ...overrides,
  });

  const disciple = { name: '@ALB/Disciple', discordRoleId: 'd', priority: 6, keep: false };
  const graduate = { name: '@ALB/Graduate', discordRoleId: 'g', priority: 5, keep: true };
  const adept = { name: '@ALB/Adept', discordRoleId: 'a', priority: 4, keep: false };

  const member: any = { id: 'candidate', displayName: 'Testy', guild: { id: 'guild-1' } };

  beforeEach(async () => {
    channelSend = jest.fn().mockImplementation(async () => ballotMessage);
    ballotMessage = { id: 'msg-1', react: jest.fn().mockResolvedValue(true) };
    registrationsExecute = jest.fn().mockResolvedValue({ affectedRows: 1 });

    registrationsRepository = {
      findOne: jest.fn().mockResolvedValue(makeRegistration()),
      getEntityManager: jest.fn().mockReturnValue({
        persist: jest.fn().mockReturnThis(),
        flush: jest.fn().mockResolvedValue(true),
        getConnection: jest.fn().mockReturnValue({ execute: registrationsExecute }),
      }),
    };

    voteRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      getEntityManager: jest.fn().mockReturnValue({
        persist: jest.fn().mockReturnThis(),
        flush: jest.fn().mockResolvedValue(true),
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRankUpService,
        ConfigService,
        {
          provide: DiscordService,
          useValue: {
            getTextChannel: jest.fn().mockResolvedValue({
              id: 'judgement-hall',
              isTextBased: () => true,
              send: channelSend,
            }),
          },
        },
        { provide: AlbionUtilities, useValue: albionUtilities },
        { provide: MemberActivityRollupService, useValue: rollupService },
        { provide: getRepositoryToken(AlbionRegistrationsEntity), useValue: registrationsRepository },
        { provide: getRepositoryToken(AlbionRankUpVoteEntity), useValue: voteRepository },
      ],
    }).compile();

    TestBootstrapper.setupConfig(module);
    service = module.get<AlbionRankUpService>(AlbionRankUpService);
    await service.onApplicationBootstrap();
  });

  const lastSentContent = () => channelSend.mock.calls[channelSend.mock.calls.length - 1][0].content;

  it('should be defined', () => {
    expect(service).toBeDefined();
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

  describe('cooldown', () => {
    it('refuses inside seven days', async () => {
      registrationsRepository.findOne.mockResolvedValue(
        makeRegistration({ lastRankUpRequestAt: daysAgo(3) }),
      );

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.reply).toContain('already requested a rank up recently');
    });

    it('allows outside seven days', async () => {
      registrationsRepository.findOne.mockResolvedValue(
        makeRegistration({ lastRankUpRequestAt: daysAgo(8) }),
      );

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.ok).toBe(true);
    });

    // Would otherwise double-punish someone refused for being too new
    it('a denial does not start the request cooldown', async () => {
      const registration = makeRegistration({ createdAt: daysAgo(2) });
      registrationsRepository.findOne.mockResolvedValue(registration);

      await service.handleRankUpRequest(member);

      expect(registration.lastRankUpRequestAt).toBeNull();
    });
  });

  describe('denial notice throttle', () => {
    it('claims the throttle by conditional update before sending', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration({ createdAt: daysAgo(2) }));

      await service.handleRankUpRequest(member);

      expect(registrationsExecute.mock.calls[0][0]).toContain('last_denial_notice_at is null or last_denial_notice_at <');
      expect(channelSend).toHaveBeenCalledTimes(1);
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
      voteRepository.getEntityManager.mockReturnValue({
        persist: jest.fn().mockReturnThis(),
        flush: jest.fn().mockRejectedValue(new Error('Duplicate entry for key pending_key')),
      });

      const outcome = await service.handleRankUpRequest(member);

      expect(outcome.reply).toContain('already have a rank up vote open');
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
    it('states the electorate, threshold and starting score', async () => {
      await service.handleRankUpRequest(member);

      const content = lastSentContent();
      expect(content).toContain('Eligible voters: 7');
      expect(content).toContain('Passes at a score of 4');
      expect(content).toContain('Current score: **0** / 4');
    });

    it('keeps the wording leadership already use', async () => {
      await service.handleRankUpRequest(member);

      const content = lastSentContent();
      expect(content).toContain('wants to be ranked up');
      expect(content).toContain('Please react with the following');
      expect(content).toContain('⛔ - to put a veto on the rank up');
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

    it('always shows Albion Online even at zero', async () => {
      await service.handleRankUpRequest(member);

      expect(lastSentContent()).toContain('Albion Online: 0h 0m');
    });

    it('shows the top three other games and omits the line when there are none', async () => {
      rollupService.getGameTotals.mockResolvedValue([
        { gameName: 'Albion Online', minutes: 600 },
        { gameName: 'Foxhole', minutes: 300 },
        { gameName: 'Deep Rock', minutes: 120 },
        { gameName: 'Factorio', minutes: 60 },
        { gameName: 'Noita', minutes: 30 },
      ]);

      await service.handleRankUpRequest(member);
      const content = lastSentContent();

      expect(content).toContain('Albion Online: 10h 0m');
      expect(content).toContain('Foxhole 5h');
      expect(content).not.toContain('Noita');
    });

    it('omits the other games line entirely when there are none', async () => {
      await service.handleRankUpRequest(member);

      expect(lastSentContent()).not.toContain('Other games');
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
