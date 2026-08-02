/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { MemberActivityRollupService } from './member.activity.rollup.service';
import { MemberDailyActivityEntity } from '../../database/entities/member.daily.activity.entity';
import { MemberDailyGameActivityEntity } from '../../database/entities/member.daily.game.activity.entity';
import { utcMidnight } from '../../helpers';

describe('MemberActivityRollupService', () => {
  let service: MemberActivityRollupService;
  let activityExecute: jest.Mock;
  let gameExecute: jest.Mock;
  let activityRepository: any;
  let gameRepository: any;

  const repoWithConnection = (execute: jest.Mock) => ({
    find: jest.fn().mockResolvedValue([]),
    findOne: jest.fn().mockResolvedValue(null),
    getEntityManager: jest.fn().mockReturnValue({
      getConnection: jest.fn().mockReturnValue({ execute }),
    }),
  });

  beforeEach(async () => {
    activityExecute = jest.fn().mockResolvedValue(undefined);
    gameExecute = jest.fn().mockResolvedValue(undefined);
    activityRepository = repoWithConnection(activityExecute);
    gameRepository = repoWithConnection(gameExecute);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberActivityRollupService,
        { provide: getRepositoryToken(MemberDailyActivityEntity), useValue: activityRepository },
        { provide: getRepositoryToken(MemberDailyGameActivityEntity), useValue: gameRepository },
      ],
    }).compile();

    service = module.get<MemberActivityRollupService>(MemberActivityRollupService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('increment', () => {
    it('issues a single statement for the whole batch', async () => {
      await service.increment(['a', 'b', 'c'], 'voiceMinutes');

      expect(activityExecute).toHaveBeenCalledTimes(1);
      expect(activityExecute.mock.calls[0][0]).toContain('voice_minutes = voice_minutes + values(voice_minutes)');
    });

    it('deduplicates member IDs within a batch', async () => {
      await service.increment(['a', 'a', 'b'], 'messagesSent');

      const params = activityExecute.mock.calls[0][1];
      // 5 bound params per row, so two rows means ten params
      expect(params).toHaveLength(10);
    });

    it('does nothing when there is nobody to count', async () => {
      await service.increment([], 'voiceMinutes');

      expect(activityExecute).not.toHaveBeenCalled();
    });

    it('rejects a counter that is not in the column map', async () => {
      await expect(service.increment(['a'], 'dropTable' as never)).rejects.toThrow('Unknown activity counter');
      expect(activityExecute).not.toHaveBeenCalled();
    });

    it('maps each counter to its own column', async () => {
      await service.increment(['a'], 'messagesSent');
      await service.increment(['a'], 'reactionsAdded');

      expect(activityExecute.mock.calls[0][0]).toContain('messages_sent');
      expect(activityExecute.mock.calls[1][0]).toContain('reactions_added');
    });

    // The regression the existing setHours-based services would have introduced here
    it('keys on UTC midnight, so a late BST evening and the next UTC morning share a row', async () => {
      const lateBstEvening = new Date('2026-07-15T23:30:00+01:00'); // 22:30 UTC on the 15th
      const nextUtcMorning = new Date('2026-07-16T00:30:00Z');

      await service.increment(['a'], 'messagesSent', 1, utcMidnight(lateBstEvening));
      await service.increment(['a'], 'messagesSent', 1, utcMidnight(nextUtcMorning));

      const firstDate: Date = activityExecute.mock.calls[0][1][1];
      const secondDate: Date = activityExecute.mock.calls[1][1][1];

      expect(firstDate.toISOString()).toBe('2026-07-15T00:00:00.000Z');
      expect(secondDate.toISOString()).toBe('2026-07-16T00:00:00.000Z');
      // Local midnight would have put the 23:30 BST write on the 16th too
      expect(firstDate).not.toEqual(secondDate);
    });

    it('swallows a database failure rather than breaking the caller', async () => {
      activityExecute.mockRejectedValueOnce(new Error('deadlock'));

      await expect(service.increment(['a'], 'messagesSent')).resolves.toBeUndefined();
    });
  });

  describe('incrementGameMinutes', () => {
    it('counts a member playing the same game twice in one tick only once', async () => {
      await service.incrementGameMinutes([
        { discordId: 'a', gameName: 'Albion Online' },
        { discordId: 'a', gameName: 'Albion Online' },
      ]);

      // 6 bound params per row
      expect(gameExecute.mock.calls[0][1]).toHaveLength(6);
    });

    it('keeps distinct games for the same member', async () => {
      await service.incrementGameMinutes([
        { discordId: 'a', gameName: 'Albion Online' },
        { discordId: 'a', gameName: 'Foxhole' },
      ]);

      expect(gameExecute.mock.calls[0][1]).toHaveLength(12);
    });

    it('drops empty and whitespace-only game names', async () => {
      await service.incrementGameMinutes([
        { discordId: 'a', gameName: '   ' },
        { discordId: 'b', gameName: '' },
      ]);

      expect(gameExecute).not.toHaveBeenCalled();
    });

    it('truncates a game name to the column width', async () => {
      const longName = 'x'.repeat(200);
      await service.incrementGameMinutes([{ discordId: 'a', gameName: longName }]);

      const storedName: string = gameExecute.mock.calls[0][1][2];
      expect(storedName).toHaveLength(128);
    });
  });

  describe('getGameTotals', () => {
    it('sums minutes per game and orders by the largest', async () => {
      gameRepository.find.mockResolvedValue([
        { gameName: 'Albion Online', minutes: 30 },
        { gameName: 'Foxhole', minutes: 90 },
        { gameName: 'Albion Online', minutes: 45 },
      ]);

      const totals = await service.getGameTotals('a', new Date());

      expect(totals).toEqual([
        { gameName: 'Foxhole', minutes: 90 },
        { gameName: 'Albion Online', minutes: 75 },
      ]);
    });
  });

  describe('getTrackingStartDate', () => {
    it('returns null when nothing has been recorded', async () => {
      activityRepository.findOne.mockResolvedValue(null);

      expect(await service.getTrackingStartDate()).toBeNull();
    });

    it('returns the earliest recorded day', async () => {
      const date = new Date('2026-01-01T00:00:00Z');
      activityRepository.findOne.mockResolvedValue({ date });

      expect(await service.getTrackingStartDate()).toBe(date);
    });
  });
});
