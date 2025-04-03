import { Test, TestingModule } from '@nestjs/testing';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { TextChannel } from 'discord.js';
import { PurgeService } from './purge.service';
import { TestBootstrapper } from '../../test.bootstrapper';
import { ActivityReportCronService } from './activity.report.cron.service';
import { ActivityService } from './activity.service';

describe('ActivityReportCronService', () => {
  let activityReportCronService: ActivityReportCronService;
  let discordService: DiscordService;
  let configService: ConfigService;
  let activityService: ActivityService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivityReportCronService,
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
            startEnumeration: jest.fn(),
          },
        },
        Logger,
      ],
    }).compile();

    activityReportCronService = module.get<ActivityReportCronService>(ActivityReportCronService);
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

      await activityReportCronService.onApplicationBootstrap();

      expect(configService.get).toHaveBeenCalledWith('discord.channels.activityReports');
      expect(discordService.getChannel).toHaveBeenCalledWith('test-channel-id');
      expect(mockChannel.isTextBased).toHaveBeenCalled();
      expect(activityReportCronService['channel']).toBe(mockChannel);
    });

    it('should throw an error if the channel is not found', async () => {
      (configService.get as jest.Mock).mockReturnValue('test-channel-id');
      (discordService.getChannel as jest.Mock).mockResolvedValue(null);

      await expect(activityReportCronService.onApplicationBootstrap()).rejects.toThrow('Could not find channel with ID test-channel-id');
    });

    it('should throw an error if the channel is not text-based', async () => {
      const mockChannel = {
        isTextBased: jest.fn().mockReturnValue(false),
      } as unknown as TextChannel;

      (configService.get as jest.Mock).mockReturnValue('test-channel-id');
      (discordService.getChannel as jest.Mock).mockResolvedValue(mockChannel);

      await expect(activityReportCronService.onApplicationBootstrap()).rejects.toThrow('Channel with ID test-channel-id is not a text channel');
    });
  });

  describe('runReport', () => {
    it('should run the enumeration command', async () => {
      const mockMessage = TestBootstrapper.getMockDiscordMessage();

      const mockChannel = {
        send: jest.fn().mockImplementation(async () => {
          return mockMessage;
        }),
      } as unknown as TextChannel;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (activityReportCronService as any).channel = mockChannel;

      await activityReportCronService.runReport();

      expect(mockChannel.send).toHaveBeenCalledWith('Starting daily activity enumeration...');
      expect(activityService.startEnumeration).toHaveBeenCalledWith(mockMessage);
    });
  });
});
