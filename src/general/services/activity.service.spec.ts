/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { DiscordService } from '../../discord/discord.service';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { Logger } from '@nestjs/common';
import { TestBootstrapper } from '../../test.bootstrapper';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ActivityStatisticsEntity } from '../../database/entities/activity.statistics.entity';

describe('ActivityService', () => {
  let activityService: ActivityService;

  let mockChannel: any;
  let mockStatusMessage: any;
  const mockActivityEntity = {
    discordId: '123456',
    discordNickname: 'testuser',
    lastActivity: new Date(),
  } as ActivityEntity;
  const mockActivityStatisticsEntity = {
    totalUsers: 0,
    inactiveUsers: 0,
    activeUsers90d: 0,
    activeUsers60d: 0,
    activeUsers30d: 0,
    activeUsers14d: 0,
    activeUsers7d: 0,
    activeUsers3d: 0,
    activeUsers1d: 0,
  } as ActivityStatisticsEntity;
  let mockActivityRepository: any;
  let mockActivityStatisticsRepository: any;

  beforeEach(async () => {
    mockActivityRepository = TestBootstrapper.getMockRepositoryInjected(mockActivityEntity);
    mockActivityStatisticsRepository = TestBootstrapper.getMockRepositoryInjected(mockActivityStatisticsEntity);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        {
          provide: DiscordService,
          useValue: {
            kickMember: jest.fn(),
            batchSend: jest.fn(),
            getGuildMember:  jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ActivityEntity),
          useValue: mockActivityRepository,
        },
        {
          provide: getRepositoryToken(ActivityStatisticsEntity),
          useValue: mockActivityStatisticsRepository,
        },
        Logger,
      ],
    }).compile();

    activityService = module.get<ActivityService>(ActivityService);
    mockActivityRepository = module.get(getRepositoryToken(ActivityEntity));

    mockStatusMessage = TestBootstrapper.getMockDiscordMessage();

    mockChannel = TestBootstrapper.getMockDiscordTextChannel();
    mockChannel.send = jest.fn().mockResolvedValue(mockStatusMessage);

  });

  it('should be defined', () => {
    expect(activityService).toBeDefined();
  });

  describe('removeActivityRecord', () => {
    it('should remove the activity record', async () => {
      await activityService.removeActivityRecord(mockActivityEntity, false);

      expect(mockActivityRepository.getEntityManager().removeAndFlush).toHaveBeenCalledWith(mockActivityEntity);
    });

    it('should not remove the activity record on a dry run', async () => {
      await activityService.removeActivityRecord(mockActivityEntity, true);
      expect(mockActivityRepository.getEntityManager().removeAndFlush).toBeCalledTimes(0);
    });

    it('should properly handle database errors and throw an custom error', async () => {
      mockActivityRepository.getEntityManager().removeAndFlush = jest.fn().mockImplementation(() => {throw new Error('Database went boom!');});

      await expect(activityService.removeActivityRecord(mockActivityEntity, false))
        .rejects
        .toThrow('Error removing activity record for leaver testuser (123456). Error: Database went boom!');

      expect(mockActivityRepository.getEntityManager().removeAndFlush).toBeCalledTimes(1);
    });
  });

  describe('getActivityRecords', () => {
    it('should fetch all activity records', async () => {
      const mockRecords = [mockActivityEntity];
      mockActivityRepository.findAll = jest.fn().mockResolvedValue(mockRecords);

      const result = await activityService.getActivityRecords();

      expect(result).toEqual(mockRecords);
      expect(mockActivityRepository.findAll).toHaveBeenCalled();
    });

    it('should handle errors when fetching activity records', async () => {
      mockActivityRepository.findAll = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(activityService.getActivityRecords()).rejects.toThrow('Error fetching activity records. Error: Database error');
      expect(mockActivityRepository.findAll).toHaveBeenCalled();
    });
  });

  describe('enumerateActivity', () => {
    let activityRecords: ActivityEntity[];

    beforeEach(() => {
      activityRecords = [
        {
          id: 23456781,
          discordId: '23456781',
          discordNickname: 'testuser1',
          lastActivity: generateDate(0.5),
        } as ActivityEntity,
        {
          id: 23456782,
          discordId: '23456782',
          discordNickname: 'testuser2',
          lastActivity: generateDate(1.9),
        } as ActivityEntity,
        {
          id: 23456783,
          discordId: '23456783',
          discordNickname: 'testuser3',
          lastActivity: generateDate(2.8),
        } as ActivityEntity,
        {
          id: 23456784,
          discordId: '23456784',
          discordNickname: 'testuser4',
          lastActivity: generateDate(34.3),
        } as ActivityEntity,
        {
          id: 23456785,
          discordId: '23456785',
          discordNickname: 'testuser5',
          lastActivity: generateDate(89),
        } as ActivityEntity,
        {
          id: 23456786,
          discordId: '23456786',
          discordNickname: 'testuser6',
          lastActivity: generateDate(100),
        } as ActivityEntity,
      ];

      mockActivityRepository.findAll = jest.fn().mockResolvedValue(activityRecords);

      mockActivityStatisticsRepository.persistAndFlush = jest.fn();
    });

    it('should collate activity records and create statistics', async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      await activityService.enumerateActivity();

      const mockStatistics = new ActivityStatisticsEntity(
        {
          createdAt: today,
          updatedAt: today,
          totalUsers: 6,
          inactiveUsers: 1,
          activeUsers90d: 5,
          activeUsers60d: 4,
          activeUsers30d: 3,
          activeUsers14d: 3,
          activeUsers7d: 3,
          activeUsers3d: 3,
          activeUsers2d: 2,
          activeUsers1d: 1,
        },
      );

      expect(mockActivityStatisticsRepository.getEntityManager().persistAndFlush).toHaveBeenCalledWith(mockStatistics);
    });

    it('should handle database errors', async () => {
      mockActivityStatisticsRepository.persistAndFlush = jest.fn().mockRejectedValue(new Error('Database error'));

      await expect(activityService.enumerateActivity()).rejects.toThrow('Error enumerating activity records. Error: Database error');
    });

    describe('startEnumeration', () => {
      const nowSecs = Math.floor(Date.now() / 1000);
      const mockReport = `# Activity Report <t:${nowSecs}:D>
- Total Users: **6**
- Inactive Users (>90d): **1**
- Active Users (<90d): **5**
- Active Users (<60d): **4**
- Active Users (<30d): **3**
- Active Users (<14d): **3**
- Active Users (<7d): **3**
- Active Users (<3d): **3**
- Active Users (<2d): **2**
- Active Users (<1d): **1**`;

      beforeEach(() => {
        activityService.enumerateActivity = jest.fn();

        mockActivityStatisticsRepository.find = jest.fn().mockResolvedValue([{
          totalUsers: 6,
          inactiveUsers: 1,
          activeUsers90d: 5,
          activeUsers60d: 4,
          activeUsers30d: 3,
          activeUsers14d: 3,
          activeUsers7d: 3,
          activeUsers3d: 3,
          activeUsers2d: 2,
          activeUsers1d: 1,
        }]);
      });

      it('should send a message and start enumeration', async () => {
        await activityService.startEnumeration(mockStatusMessage);

        expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Starting daily activity enumeration...');
        expect(activityService.enumerateActivity).toHaveBeenCalled();
      });

      it('should handle errors during enumeration', async () => {
        activityService.enumerateActivity = jest.fn().mockRejectedValue(new Error('Enumeration error'));

        await activityService.startEnumeration(mockStatusMessage);

        expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Error enumerating activity records. Error: Enumeration error');
      });

      it('should handle errors after enumeration', async () => {
        mockStatusMessage.channel.send = jest.fn()
          .mockResolvedValueOnce(true)
          .mockRejectedValueOnce(new Error('Send error!'));

        await activityService.startEnumeration(mockStatusMessage);

        expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Starting daily activity enumeration...');
        expect(mockStatusMessage.channel.send).toHaveBeenCalledWith(mockReport);
        expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Error starting activity enumeration. Error: Send error!');
      });

      it('should handle empty database', async () => {
        mockActivityStatisticsRepository.find = jest.fn().mockResolvedValue([]);

        await activityService.startEnumeration(mockStatusMessage);

        expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Error enumerating activity records. Error: No activity statistics found!');
      });

      it('should properly generate the report', async () => {
        await activityService.startEnumeration(mockStatusMessage);

        expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Starting daily activity enumeration...');

        expect(mockStatusMessage.channel.send).toHaveBeenCalledWith(mockReport);
      });
    });
  });
});

const generateDate = (daysInactive: number): Date => {
  const now = new Date();
  // Subtract daysInactive (which may be fractional) in milliseconds
  const newTime = now.getTime() - daysInactive * 24 * 60 * 60 * 1000;
  return new Date(newTime);
};