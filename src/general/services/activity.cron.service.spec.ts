import { Test, TestingModule } from '@nestjs/testing';
import { ActivityCronService } from './activity.cron.service';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { ActivityService } from './activity.service';
import { Logger } from '@nestjs/common';
import { TextChannel } from 'discord.js';

describe('ActivityCronService', () => {
  let activityCronService: ActivityCronService;
  let discordService: DiscordService;
  let configService: ConfigService;
  let activityService: ActivityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityCronService,
        {
          provide: DiscordService,
          useValue: {
            getChannel: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: ActivityService,
          useValue: {
            scanAndRemoveLeavers: jest.fn(),
          },
        },
        Logger,
      ],
    }).compile();

    activityCronService = module.get<ActivityCronService>(ActivityCronService);
    discordService = module.get<DiscordService>(DiscordService);
    configService = module.get<ConfigService>(ConfigService);
    activityService = module.get<ActivityService>(ActivityService);
  });

  describe('onApplicationBootstrap', () => {
    it('should initialize and find the text channel', async () => {
      const mockChannel = {
        isTextBased: jest.fn().mockReturnValue(true),
      } as unknown as TextChannel;

      (configService.get as jest.Mock).mockReturnValue('test-channel-id');
      (discordService.getChannel as jest.Mock).mockResolvedValue(mockChannel);

      await activityCronService.onApplicationBootstrap();

      expect(configService.get).toHaveBeenCalledWith('discord.channels.botJobs');
      expect(discordService.getChannel).toHaveBeenCalledWith('test-channel-id');
      expect(mockChannel.isTextBased).toHaveBeenCalled();
      expect(activityCronService['channel']).toBe(mockChannel);
    });

    it('should throw an error if the channel is not found', async () => {
      (configService.get as jest.Mock).mockReturnValue('test-channel-id');
      (discordService.getChannel as jest.Mock).mockResolvedValue(null);

      await expect(activityCronService.onApplicationBootstrap()).rejects.toThrow('Could not find channel with ID test-channel-id');
    });

    it('should throw an error if the channel is not text-based', async () => {
      const mockChannel = {
        isTextBased: jest.fn().mockReturnValue(false),
      } as unknown as TextChannel;

      (configService.get as jest.Mock).mockReturnValue('test-channel-id');
      (discordService.getChannel as jest.Mock).mockResolvedValue(mockChannel);

      await expect(activityCronService.onApplicationBootstrap()).rejects.toThrow('Channel with ID test-channel-id is not a text channel');
    });
  });

  describe('runActivityDataScans', () => {
    it('should log and run activity data scans', async () => {
      const mockChannel = {
        send: jest.fn(),
      } as unknown as TextChannel;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (activityCronService as any).channel = mockChannel;

      await activityCronService.runActivityDataScans();

      expect(mockChannel.send).toHaveBeenCalledWith('Starting activity scan cron');
      expect(activityService.scanAndRemoveLeavers).toHaveBeenCalledWith(mockChannel);
    });
  });
});
