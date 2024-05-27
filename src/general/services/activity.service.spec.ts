import { Test, TestingModule } from '@nestjs/testing';
import { ActivityService } from './activity.service';
import { DiscordService } from '../../discord/discord.service';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { Logger } from '@nestjs/common';
import { GuildTextBasedChannel, Message, Guild, GuildMember } from 'discord.js';

describe('ActivityService', () => {
  let activityService: ActivityService;
  let activityRepository: EntityRepository<ActivityEntity>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityService,
        {
          provide: DiscordService,
          useValue: { /* mock DiscordService methods if any */ },
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
  });

  describe('scanAndRemoveLeavers', () => {
    let mockChannel: GuildTextBasedChannel;
    let mockStatusMessage: Message;
    let mockGuild: Guild;
    let mockGuildMembers: Map<string, GuildMember>;

    beforeEach(() => {
      mockGuildMembers = new Map();

      mockGuild = {
        members: {
          cache: {
            get: jest.fn((id) => mockGuildMembers.get(id)),
          },
        },
      } as unknown as Guild;

      mockChannel = {
        send: jest.fn(),
        guild: mockGuild,
      } as unknown as GuildTextBasedChannel;

      mockStatusMessage = {
        edit: jest.fn(),
        delete: jest.fn(),
        channel: {
          send: jest.fn(),
        },
      } as unknown as Message;

      (mockChannel.send as jest.Mock).mockResolvedValue(mockStatusMessage);
    });

    it('should scan and remove leavers', async () => {
      const mockActivityMembers: ActivityEntity[] = [
        { discordId: '1', discordNickname: 'User1' } as ActivityEntity,
        { discordId: '2', discordNickname: 'User2' } as ActivityEntity,
      ];

      (activityRepository.findAll as jest.Mock).mockResolvedValue(mockActivityMembers);

      await activityService.scanAndRemoveLeavers(mockChannel);

      expect(mockChannel.send).toHaveBeenCalledWith('Fetching activity records...');
      expect(mockStatusMessage.edit).toHaveBeenCalledWith('Scanning activity records... 0 of 2');
      expect(mockStatusMessage.edit).toHaveBeenCalledWith('Scanning activity records... 2 of 2');
      expect(activityRepository.removeAndFlush).toHaveBeenCalledTimes(2);
      expect(mockStatusMessage.delete).toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalledWith('Activity scan complete. Removed **2** leavers out of activity records. **0** records remaining.');
    });

    it('should scan and remove partial leavers', async () => {
      const mockActivityMembers: ActivityEntity[] = [
        { discordId: '1', discordNickname: 'User1' } as ActivityEntity,
        { discordId: '2', discordNickname: 'User2' } as ActivityEntity,
      ];

      (activityRepository.findAll as jest.Mock).mockResolvedValue(mockActivityMembers);

      (mockGuild.members.cache.get as jest.Mock).mockImplementation((id) => {
        if (id === '2') {
          return {
            user: {
              bot: false,
              id: 12345689,
            },
          };
        }
        return null;
      });

      await activityService.scanAndRemoveLeavers(mockChannel);

      expect(activityRepository.removeAndFlush).toHaveBeenCalledTimes(1);
      expect(mockChannel.send).toHaveBeenCalledWith('- Removed User1 (1)\n');
      expect(mockChannel.send).toHaveBeenCalledWith('Activity scan complete. Removed **1** leavers out of activity records. **1** records remaining.');
    });

    it('should handle errors during member scanning', async () => {
      const mockActivityMembers: ActivityEntity[] = [
        { discordId: '1', discordNickname: 'User1' } as ActivityEntity,
        { discordId: '2', discordNickname: 'User2' } as ActivityEntity,
      ];

      (activityRepository.findAll as jest.Mock).mockResolvedValue(mockActivityMembers);
      (activityRepository.removeAndFlush as jest.Mock).mockRejectedValue(new Error('Remove error'));

      await activityService.scanAndRemoveLeavers(mockChannel);

      expect(mockChannel.send).toHaveBeenCalledWith('Fetching activity records...');
      expect(mockStatusMessage.edit).toHaveBeenCalledWith('Scanning activity records... 0 of 2');
      expect(mockStatusMessage.edit).toHaveBeenCalledWith('Scanning activity records... 2 of 2');
      expect(activityRepository.removeAndFlush).toHaveBeenCalledTimes(2);
      expect(mockStatusMessage.delete).toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalledWith('Activity scan complete. Removed **0** leavers out of activity records. **2** records remaining.');
    });

    it('should log and send an error message if database record removal fails', async () => {
      const mockActivityMembers: ActivityEntity[] = [
        { discordId: '1', discordNickname: 'User1' } as ActivityEntity,
        { discordId: '2', discordNickname: 'User2' } as ActivityEntity,
      ];

      (activityRepository.findAll as jest.Mock).mockResolvedValue(mockActivityMembers);
      (mockGuild.members.cache.get as jest.Mock).mockImplementation((id) => {
        if (id === '2') {
          return null;
        }
        return {
          user: {
            bot: false,
            id: 12345689,
          },
        };
      });
      (activityRepository.removeAndFlush as jest.Mock).mockRejectedValue(new Error('Remove error'));

      await activityService.scanAndRemoveLeavers(mockChannel);

      expect(mockChannel.send).toHaveBeenCalledWith('Fetching activity records...');
      expect(mockStatusMessage.edit).toHaveBeenCalledWith('Scanning activity records... 0 of 2');
      expect(mockStatusMessage.edit).toHaveBeenCalledWith('Scanning activity records... 2 of 2');
      expect(mockStatusMessage.delete).toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalledWith('Activity scan complete. Removed **0** leavers out of activity records. **2** records remaining.');
      expect(mockChannel.send).toHaveBeenCalledWith('Error removing activity record for User2 (2). Error: Remove error');
    });

    it('should log and send an error message if discord error occurs', async () => {
      const mockActivityMembers: ActivityEntity[] = [
        { discordId: '1', discordNickname: 'User1' } as ActivityEntity,
        { discordId: '2', discordNickname: 'User2' } as ActivityEntity,
      ];

      (activityRepository.findAll as jest.Mock).mockResolvedValue(mockActivityMembers);
      (mockChannel.guild.members.cache.get as jest.Mock).mockImplementation((id) => {
        if (id === '2') {
          throw new Error('Discord error happened');
        }
        return { id: 12345689 };
      });
      await activityService.scanAndRemoveLeavers(mockChannel);

      expect(mockChannel.send).toHaveBeenCalledWith('Fetching activity records...');
      expect(mockStatusMessage.edit).toHaveBeenCalledWith('Scanning activity records... 0 of 2');
      expect(mockStatusMessage.edit).toHaveBeenCalledWith('Scanning activity records... 2 of 2');
      expect(activityRepository.removeAndFlush).toHaveBeenCalledTimes(0);
      expect(mockStatusMessage.delete).toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalledWith('Activity scan complete. Removed **0** leavers out of activity records. **2** records remaining.');
      expect(mockChannel.send).toHaveBeenCalledWith('Error removing activity record for User2 (2). Error: Discord error happened');
    });
  });
});
