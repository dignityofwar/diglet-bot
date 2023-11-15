import { PS2CronService } from './ps2.cron.service';
import { DiscordService } from '../../discord/discord.service';
import { PS2GameScanningService } from './ps2.game.scanning.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { TestBootstrapper } from '../../test.bootstrapper';

jest.mock('discord.js', () => {
  return {
    TextChannel: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({}),
      isTextBased: () => true,
    })),
    Message: jest.fn(),
  };
});

describe('PS2CronService', () => {
  let service: PS2CronService;
  let discordService: DiscordService;
  const scanChannelId = TestBootstrapper.mockConfig.discord.channels.ps2Scans;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PS2CronService,
        ConfigService,
        ReflectMetadataProvider,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DiscordService,
          useValue: {
            getChannel: jest.fn(),
            getUser: jest.fn(),
            getRole: jest.fn(),
          },
        },
        {
          provide: PS2GameScanningService,
          useValue: {
            startScan: jest.fn(),
          },
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    discordService = moduleRef.get<DiscordService>(DiscordService);
    service = moduleRef.get<PS2CronService>(PS2CronService);
  });

  it('should be defined', async () => {
    expect(service).toBeDefined();
  });

  it('should initialize without errors', async () => {
    discordService.getChannel = jest.fn().mockReturnValue({
      isTextBased: jest.fn().mockReturnValue(true),
    });
    await expect(service.onApplicationBootstrap()).resolves.not.toThrow();
  });

  it('init should throw an error if channel does not exist', async () => {
    discordService.getChannel = jest.fn().mockReturnValue(null);
    await expect(service.onApplicationBootstrap()).rejects.toThrow(`Could not find channel with ID ${scanChannelId}`);
  });

  it('init should throw an error channel is not a text channel', async () => {
    discordService.getChannel = jest.fn().mockReturnValue({
      isTextBased: jest.fn().mockReturnValue(false),
    });

    await expect(service.onApplicationBootstrap()).rejects.toThrow(`Channel with ID ${scanChannelId} is not a text channel`);
  });

  it('should upon being called send two messages to the channel', async () => {
    discordService.getChannel = jest.fn().mockReturnValue({
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(true),
    });
    await service.onApplicationBootstrap();
    await service.runPS2Scans();
    // eslint-disable-next-line
    expect((service as any).channel.send).toBeCalledTimes(2);
  });
});
