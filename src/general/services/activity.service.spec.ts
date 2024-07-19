/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { DiscordService } from '../../discord/discord.service';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { Logger } from '@nestjs/common';
import { TestBootstrapper } from '../../test.bootstrapper';
import { getRepositoryToken } from '@mikro-orm/nestjs';

describe('ActivityService', () => {
  let activityService: ActivityService;

  let mockChannel: any;
  let mockStatusMessage: any;
  const mockActivityEntity = {
    discordId: '123456',
    discordNickname: 'testuser',
  } as ActivityEntity;
  let mockActivityRepository: any;

  beforeEach(async () => {
    mockActivityRepository = TestBootstrapper.getMockRepositoryInjected(mockActivityEntity);

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
      expect(mockActivityRepository.removeAndFlush).toHaveBeenCalledWith(mockActivityEntity);
    });

    it('should not remove the activity record on a dry run', async () => {
      await activityService.removeActivityRecord(mockActivityEntity, true);
      expect(mockActivityRepository.removeAndFlush).toBeCalledTimes(0);
    });

    it('should properly handle database errors and throw an custom error', async () => {
      mockActivityRepository.removeAndFlush = jest.fn().mockImplementation(() => {throw new Error('Database went boom!');});
      await expect(activityService.removeActivityRecord(mockActivityEntity, false))
        .rejects
        .toThrow('Error removing activity record for leaver testuser (123456). Error: Database went boom!');
      expect(mockActivityRepository.removeAndFlush).toBeCalledTimes(1);
    });
  });
});
