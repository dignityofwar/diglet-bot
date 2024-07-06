/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { DiscordService } from '../../discord/discord.service';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { Logger } from '@nestjs/common';
import { GuildMember } from 'discord.js';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('ActivityService', () => {
  let activityService: ActivityService;
  let activityRepository: EntityRepository<ActivityEntity>;

  let mockChannel: any;
  let mockStatusMessage: any;
  let mockGuildMembers: Map<string, GuildMember>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        {
          provide: DiscordService,
          useValue: {
            kickMember: jest.fn(),
            batchSend: jest.fn(),
          },
        },
        {
          provide: 'ActivityEntityRepository',
          useValue: {
            findAll: jest.fn(),
            removeAndFlush: jest.fn(),
          },
        },
        Logger,
      ],
    }).compile();

    activityService = module.get<ActivityService>(ActivityService);
    activityRepository = module.get<EntityRepository<ActivityEntity>>('ActivityEntityRepository');

    mockStatusMessage = TestBootstrapper.getMockDiscordMessage();

    mockChannel = TestBootstrapper.getMockDiscordTextChannel();
    mockChannel.send = jest.fn().mockResolvedValue(mockStatusMessage);

  });

  it('should be defined', () => {
    expect(activityService).toBeDefined();
  });

  describe('startScan', () => {
    beforeEach(() => {
      activityRepository.findAll = jest.fn().mockResolvedValue([]);
      activityService.scanForLeavers = jest.fn().mockResolvedValue([]);
    });
    it('should properly indicate progress and the appropriate functions called', async () => {
      await activityService.startScan(mockChannel, false);
      expect(mockChannel.send).toHaveBeenCalledWith('# Starting Activity Leaver Scan');

      expect(mockStatusMessage.edit).toHaveBeenCalledWith('## 1: Getting active member list...');
      expect(activityRepository.findAll).toHaveBeenCalled();

      expect(mockStatusMessage.edit).toHaveBeenCalledWith('## 2: Scanning active member records for leavers...');
      expect(activityService.scanForLeavers).toHaveBeenCalled();

      expect(mockStatusMessage.delete).toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalledWith('Activity scan complete. Purged 5 inactive members.');
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

      mockGuildMembers.set('1', {} as GuildMember);
      mockGuildMembers.set('2', undefined as unknown as GuildMember);

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);
      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Scanning member list for leavers... 0 of 3 (0%)');
      expect(newStatusMessage.edit).toHaveBeenCalledWith('Scanning member list for leavers... 3 of 3 (100%)');
    });

    it('should properly indicate progress when there is more than 10 records', async () => {
      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockStatusMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      const mockActivityMembers = createMockActivityMembers(20);
      mockGuildMembers.set('1', {} as GuildMember);
      mockGuildMembers.set('2', undefined as unknown as GuildMember);

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);
      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Scanning member  for leavers... 0 of 20 (0%)');
      expect(newStatusMessage.edit).toHaveBeenCalledWith('Scanning member list for leavers... 10 of 20 (50%)');
      expect(newStatusMessage.edit).toHaveBeenCalledWith('Scanning member list for leavers... 20 of 20 (100%)');
    });

    it('should call the removeActivityRecord function should a leaver be detected', async () => {
      const mockActivityMembers = createMockActivityMembers(2);
      mockGuildMembers.set('1', {} as GuildMember);
      mockGuildMembers.set('2', undefined as unknown as GuildMember);

      await activityService.scanForLeavers(mockActivityMembers, mockStatusMessage, false);

      expect(activityService.removeActivityRecord).toHaveBeenCalledWith(mockActivityMembers[1], mockStatusMessage, false);
    });
  });
});

function createMockActivityMembers(count: number): ActivityEntity[] {
  return Array.from({ length: count }, (_, index) => ({
    discordId: (index + 1).toString(),
    discordNickname: `test${index + 1}`,
  })) as ActivityEntity[];
}
