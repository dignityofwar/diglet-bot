/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { MemberActivityReportService } from './member.activity.report.service';
import { MemberActivityRollupService } from './member.activity.rollup.service';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { utcMidnight } from '../../helpers';

describe('MemberActivityReportService', () => {
  let service: MemberActivityReportService;
  let activityRepository: any;
  let rollupService: any;

  const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const mockUser = { id: '1234567890', username: 'mockuser' } as any;
  const mockMember = (joinedAt: Date | null = daysAgo(200)) => ({
    displayName: 'Mock Member',
    joinedAt,
  }) as any;

  const rollupRow = (date: Date, messagesSent = 0, reactionsAdded = 0, voiceMinutes = 0) => ({
    date,
    messagesSent,
    reactionsAdded,
    voiceMinutes,
  }) as any;

  beforeEach(async () => {
    activityRepository = { findOne: jest.fn().mockResolvedValue(null) };
    rollupService = {
      getTrackingStartDate: jest.fn().mockResolvedValue(daysAgo(100)),
      getRollup: jest.fn().mockResolvedValue([]),
      getGameTotals: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberActivityReportService,
        { provide: getRepositoryToken(ActivityEntity), useValue: activityRepository },
        { provide: MemberActivityRollupService, useValue: rollupService },
      ],
    }).compile();

    service = module.get<MemberActivityReportService>(MemberActivityReportService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('windowStart', () => {
    it('measures from tracking start when the member predates it', () => {
      const trackingStart = utcMidnight(daysAgo(100));

      expect(service.windowStart(trackingStart, daysAgo(300))).toEqual(trackingStart);
    });

    it('measures from the join date when the member joined after tracking began', () => {
      const joinedAt = daysAgo(10);

      expect(service.windowStart(utcMidnight(daysAgo(100)), joinedAt)).toEqual(utcMidnight(joinedAt));
    });

    it('falls back to today when nothing has ever been tracked', () => {
      expect(service.windowStart(null, null)).toEqual(utcMidnight());
    });
  });

  describe('buildReport', () => {
    it('returns the summary and the games as separate messages', async () => {
      const [summary, games] = await service.buildReport(mockUser, mockMember());

      expect(summary).toContain('### Engagement');
      expect(summary).not.toContain('### 🎮 Game Activity');
      expect(games).toContain('### 🎮 Game Activity');
    });

    it('reports the member name, mention and join date', async () => {
      const [summary] = await service.buildReport(mockUser, mockMember(daysAgo(5)));

      expect(summary).toContain('# 📊 Activity Report: Mock Member');
      expect(summary).toContain('<@1234567890>');
      expect(summary).toContain('Joined the server:');
      expect(summary).toContain('**5** days ago');
    });

    it('falls back to the username when the member has left the server', async () => {
      const [summary] = await service.buildReport(mockUser, null);

      expect(summary).toContain('# 📊 Activity Report: mockuser');
      expect(summary).toContain('Not currently a member of this server.');
    });

    it('shows the last activity timestamp when one is recorded', async () => {
      const lastActivity = daysAgo(2);
      activityRepository.findOne.mockResolvedValue({ lastActivity } as ActivityEntity);

      const [summary] = await service.buildReport(mockUser, mockMember());

      expect(summary).toContain(`<t:${Math.floor(lastActivity.getTime() / 1000)}:R>`);
    });

    it('says so plainly when nothing has ever been seen from them', async () => {
      const [summary] = await service.buildReport(mockUser, mockMember());

      expect(summary).toContain('Last seen: **never recorded**');
    });

    // The live record is deleted on guildMemberRemove, so a leaver has rollups but no record
    it('falls back to the last active rollup day when the live record has been deleted', async () => {
      const lastActive = daysAgo(3);
      rollupService.getRollup.mockResolvedValue([
        rollupRow(daysAgo(9), 4),
        rollupRow(lastActive, 1),
        rollupRow(daysAgo(1), 0, 0, 0),
      ]);

      const [summary] = await service.buildReport(mockUser, null);

      expect(summary).toContain(`on or around <t:${Math.floor(lastActive.getTime() / 1000)}:D>`);
      expect(summary).not.toContain('never recorded');
    });

    it('totals the engagement counters and bands the active days', async () => {
      rollupService.getTrackingStartDate.mockResolvedValue(utcMidnight(daysAgo(4)));
      rollupService.getRollup.mockResolvedValue([
        rollupRow(daysAgo(3), 10, 2, 30),
        rollupRow(daysAgo(2), 5, 1, 90),
        rollupRow(daysAgo(1), 0, 0, 0),
      ]);

      const [summary] = await service.buildReport(mockUser, mockMember(daysAgo(300)));

      expect(summary).toContain('💬 Messages: **15**');
      expect(summary).toContain('⭐ Reactions: **3**');
      // Averaged the same way messages are - two hours reads very differently over five days
      // than it does over five months
      expect(summary).toContain('🎙️ Voice: **2h 0m** (0.4h/day)');
      // Five, not four - the day in progress counts, same as the rank up ballot
      expect(summary).toContain('📊 Active days all time: **2** of **5** days (40%) — 🟠 Occasional');
    });

    it('flags an empty window rather than rendering zeroes', async () => {
      const [summary] = await service.buildReport(mockUser, mockMember());

      expect(summary).toContain('📭 **Nothing recorded in this window.**');
      expect(summary).not.toContain('💬 Messages:');
    });

    it('lists games in order with their share of the total', async () => {
      rollupService.getGameTotals.mockResolvedValue([
        { gameName: 'Albion Online', minutes: 180 },
        { gameName: 'Foxhole', minutes: 60 },
      ]);

      const [, games] = await service.buildReport(mockUser, mockMember());

      expect(games).toContain('Total tracked game time: **4h 0m** across **2** games');
      expect(games).toContain('**Albion Online** — 3h 0m (75%)');
      expect(games).toContain('**Foxhole** — 1h 0m (25%)');
    });

    it('counts the tail without naming it when a member plays more than ten games', async () => {
      rollupService.getGameTotals.mockResolvedValue(
        Array.from({ length: 13 }, (_, index) => ({ gameName: `Game ${index}`, minutes: 10 * (13 - index) })),
      );

      const [, games] = await service.buildReport(mockUser, mockMember());

      expect(games).toContain('**Game 0** — 2h 10m');
      expect(games).toContain('**Game 9**');
      expect(games).not.toContain('**Game 10**');
      expect(games).toContain('…and **3** others totalling 1h 0m');
    });

    it('keeps both messages inside Discord\'s limit when game names are at their maximum length', async () => {
      rollupService.getGameTotals.mockResolvedValue(
        Array.from({ length: 12 }, () => ({ gameName: 'g'.repeat(128), minutes: 60 })),
      );
      rollupService.getRollup.mockResolvedValue([rollupRow(daysAgo(1), 10, 2, 30)]);

      const [summary, games] = await service.buildReport(mockUser, mockMember());

      expect(summary.length).toBeLessThanOrEqual(2000);
      expect(games.length).toBeLessThanOrEqual(2000);
      // Trimmed rather than dropped - the full count still appears in the total line
      expect(games).toContain('across **12** games');
    });

    it('notes when no game activity has been recorded', async () => {
      const [, games] = await service.buildReport(mockUser, mockMember());

      expect(games).toContain('📭 **No game activity recorded.**');
    });

    it('says tracking is empty when nothing has been recorded for anyone', async () => {
      rollupService.getTrackingStartDate.mockResolvedValue(null);

      const [summary] = await service.buildReport(mockUser, mockMember());

      expect(summary).toContain('Activity tracking has not recorded anything yet, for anyone.');
    });

    it('attributes the window to the join date when the member joined after tracking began', async () => {
      const [summary] = await service.buildReport(mockUser, mockMember(daysAgo(10)));

      expect(summary).toContain('since they joined the server');
    });

    it('attributes the window to tracking start when the member predates it', async () => {
      const [summary] = await service.buildReport(mockUser, mockMember(daysAgo(300)));

      expect(summary).toContain('since tracking began');
    });

    it('queries both rollups from the same window start', async () => {
      await service.buildReport(mockUser, mockMember(daysAgo(10)));

      const since = rollupService.getRollup.mock.calls[0][1];
      expect(rollupService.getGameTotals).toHaveBeenCalledWith('1234567890', since);
    });
  });
});
