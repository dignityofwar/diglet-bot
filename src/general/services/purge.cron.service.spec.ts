import { Test, TestingModule } from '@nestjs/testing';
import { PurgeCronService } from './purge.cron.service';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { TextChannel } from 'discord.js';
import { PurgeService } from './purge.service';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('PurgeCronService', () => {
  let purgeCronService: PurgeCronService;
  let discordService: DiscordService;
  let configService: ConfigService;
  let purgeService: PurgeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PurgeCronService,
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
          provide: PurgeService,
          useValue: {
            startPurge: jest.fn(),
          },
        },
        Logger,
      ],
    }).compile();

    purgeCronService = module.get<PurgeCronService>(PurgeCronService);
    discordService = module.get<DiscordService>(DiscordService);
    configService = module.get<ConfigService>(ConfigService);
    purgeService = module.get<PurgeService>(PurgeService);
  });

  describe('onApplicationBootstrap', () => {
    it('should initialize and find the text channel', async () => {
      const mockChannel = {
        isTextBased: jest.fn().mockReturnValue(true),
      } as unknown as TextChannel;

      (configService.get as jest.Mock).mockReturnValue('test-channel-id');
      (discordService.getChannel as jest.Mock).mockResolvedValue(mockChannel);

      await purgeCronService.onApplicationBootstrap();

      expect(configService.get).toHaveBeenCalledWith('discord.channels.thanosSnaps');
      expect(discordService.getChannel).toHaveBeenCalledWith('test-channel-id');
      expect(mockChannel.isTextBased).toHaveBeenCalled();
      expect(purgeCronService['channel']).toBe(mockChannel);
    });

    it('should throw an error if the channel is not found', async () => {
      (configService.get as jest.Mock).mockReturnValue('test-channel-id');
      (discordService.getChannel as jest.Mock).mockResolvedValue(null);

      await expect(purgeCronService.onApplicationBootstrap()).rejects.toThrow('Could not find channel with ID test-channel-id');
    });

    it('should throw an error if the channel is not text-based', async () => {
      const mockChannel = {
        isTextBased: jest.fn().mockReturnValue(false),
      } as unknown as TextChannel;

      (configService.get as jest.Mock).mockReturnValue('test-channel-id');
      (discordService.getChannel as jest.Mock).mockResolvedValue(mockChannel);

      await expect(purgeCronService.onApplicationBootstrap()).rejects.toThrow('Channel with ID test-channel-id is not a text channel');
    });
  });

  // describe('runPurge', () => {
  //   it('should run the purge command', async () => {
  //     const mockMessage = TestBootstrapper.getMockDiscordMessage();
  //
  //     const mockChannel = {
  //       send: jest.fn().mockImplementation(async () => {
  //         return mockMessage;
  //       }),
  //     } as unknown as TextChannel;
  //
  //     // eslint-disable-next-line @typescript-eslint/no-explicit-any
  //     (purgeCronService as any).channel = mockChannel;
  //
  //     await purgeCronService.runPurge();
  //
  //     expect(mockChannel.send).toHaveBeenCalledWith('Starting daily purge scan...');
  //     expect(purgeService.startPurge).toHaveBeenCalledWith(mockMessage, false);
  //   });
  // });
});
