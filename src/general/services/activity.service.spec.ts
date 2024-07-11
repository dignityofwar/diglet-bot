/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { DiscordService } from '../../discord/discord.service';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { Logger } from '@nestjs/common';
import { GuildMember } from 'discord.js';
import { TestBootstrapper } from '../../test.bootstrapper';
import { getRepositoryToken } from '@mikro-orm/nestjs';

describe('ActivityService', () => {
  let activityService: ActivityService;
  let mockDiscordService: DiscordService;

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
    mockDiscordService = module.get<DiscordService>(DiscordService);

    mockStatusMessage = TestBootstrapper.getMockDiscordMessage();

    mockChannel = TestBootstrapper.getMockDiscordTextChannel();
    mockChannel.send = jest.fn().mockResolvedValue(mockStatusMessage);

  });

  it('should be defined', () => {
    expect(activityService).toBeDefined();
  });

  describe('startScan', () => {
    beforeEach(() => {
      mockActivityRepository.findAll = jest.fn().mockResolvedValue([]);
      activityService.scanForLeavers = jest.fn().mockResolvedValue([]);
    });
    it('should properly indicate progress and the appropriate functions called', async () => {
      await activityService.startScan(mockChannel, false);
      expect(mockChannel.send).toHaveBeenCalledWith('# Starting Activity Leaver Scan');

      expect(mockStatusMessage.edit).toHaveBeenCalledWith('## 1: Getting active member list...');
      expect(mockActivityRepository.findAll).toHaveBeenCalled();

      expect(mockStatusMessage.edit).toHaveBeenCalledWith('## 2: Scanning active member records for leavers...');
      expect(activityService.scanForLeavers).toHaveBeenCalled();

      expect(mockStatusMessage.delete).toHaveBeenCalled();
    });
  });

  describe('scanForLeavers', () => {
    beforeEach(() => {
      activityService.removeActivityRecord = jest.fn();
    });
    it('should properly indicate progress and the appropriate functions called', async () => {
      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockStatusMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      const mockActivityMembers = createMockActivityMembers(3);
      mockDiscordService.getGuildMember = jest.fn()
        .mockReturnValueOnce({} as GuildMember)
        .mockReturnValueOnce(null);

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);
      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Scanning member list for leavers... 0 of 3 (0%)');
      expect(newStatusMessage.edit).toHaveBeenCalledWith('Scanning member list for leavers... 3 of 3 (100%)');
    });

    it('should properly batch message leavers', async () => {
      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockStatusMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      const mockActivityMembers = createMockActivityMembers(3);
      mockDiscordService.getGuildMember = jest.fn()
        .mockReturnValueOnce(null)
        .mockReturnValueOnce({} as GuildMember)
        .mockReturnValueOnce(null);

      activityService.removeActivityRecord = jest.fn()
        .mockReturnValue(null);

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);
      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Scanning member list for leavers... 0 of 3 (0%)');
      expect(newStatusMessage.edit).toHaveBeenCalledWith('Scanning member list for leavers... 3 of 3 (100%)');
      expect(mockDiscordService.batchSend).toHaveBeenCalledWith([
        '- Removed leaver test1 (1) from activity records.\n',
        '- Removed leaver test3 (3) from activity records.\n',
      ], mockStatusMessage);
    });

    it('should properly indicate progress when there is more than 10 records', async () => {
      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockStatusMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      const mockActivityMembers = createMockActivityMembers(20);
      mockDiscordService.getGuildMember = jest.fn()
        .mockReturnValueOnce({} as GuildMember)
        .mockReturnValueOnce(null);

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);
      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Scanning member list for leavers... 0 of 20 (0%)');
      expect(newStatusMessage.edit).toHaveBeenCalledWith('Scanning member list for leavers... 10 of 20 (50%)');
      expect(newStatusMessage.edit).toHaveBeenCalledWith('Scanning member list for leavers... 20 of 20 (100%)');
    });

    it('should not call removeActivityRecord if there are no leavers', async () => {
      const mockActivityMembers = createMockActivityMembers(2);
      mockDiscordService.getGuildMember = jest.fn().mockReturnValue({} as GuildMember);

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);

      expect(activityService.removeActivityRecord).toBeCalledTimes(0);
    });

    it('should call the removeActivityRecord function should a leaver be detected', async () => {
      const mockActivityMembers = createMockActivityMembers(2);
      mockDiscordService.getGuildMember = jest.fn()
        .mockReturnValueOnce({} as GuildMember)
        .mockReturnValueOnce(null);

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);

      expect(activityService.removeActivityRecord).toHaveBeenCalledWith(mockActivityMembers[1], false);
    });
    it('should properly handle errors when removing activity records', async () => {
      const mockActivityMembers = createMockActivityMembers(2);
      mockDiscordService.getGuildMember = jest.fn()
        .mockReturnValue(null);

      activityService.removeActivityRecord = jest.fn()
        .mockImplementation(() => {throw new Error('Test Activity Error');});

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);
      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Error removing activity record for test1 (1). Error: Test Activity Error');
      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Error removing activity record for test2 (2). Error: Test Activity Error');

      expect(activityService.removeActivityRecord).toHaveBeenCalledWith(mockActivityMembers[0], false);
    });
    it('should properly handle errors when removing activity records after a successful one', async () => {
      const mockActivityMembers = createMockActivityMembers(2);
      mockDiscordService.getGuildMember = jest.fn()
        .mockReturnValue(null);

      activityService.removeActivityRecord = jest.fn()
        .mockReturnValueOnce(null)
        .mockImplementationOnce(() => {throw new Error('Test Error');});

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);
      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Error removing activity record for test2 (2). Error: Test Error');

      expect(activityService.removeActivityRecord).toHaveBeenCalledWith(mockActivityMembers[0], false);
    });
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

function createMockActivityMembers(count: number): ActivityEntity[] {
  return Array.from({ length: count }, (_, index) => ({
    discordId: (index + 1).toString(),
    discordNickname: `test${index + 1}`,
  })) as ActivityEntity[];
}
