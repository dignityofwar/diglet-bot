import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import _ from 'lodash';
import { AlbionCronService } from './albion.cron.service';
import { AlbionScanningService } from './albion.scanning.service';

jest.mock('discord.js', () => {
  return {
    TextChannel: jest.fn().mockImplementation(() => ({
      send: jest.fn().mockResolvedValue({}),
      isTextBased: () => true,
    })),
    Message: jest.fn(),
  };
});

describe('AlbionCronService', () => {
  let config: ConfigService;
  let service: AlbionCronService;
  let discordService: DiscordService;
  const scanChannelId = '123456789';

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionCronService,
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
          provide: AlbionScanningService,
          useValue: {
            startScan: jest.fn(),
          },
        },
      ],
    }).compile();

    config = module.get<ConfigService>(ConfigService);
    discordService = module.get<DiscordService>(DiscordService);
    service = module.get<AlbionCronService>(AlbionCronService);

    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        discord: {
          channels: {
            albionScans: scanChannelId,
          },
        },
      };

      const result = _.get(data, key);

      if (!result) {
        throw new Error(`Unexpected config key: ${key}`);
      }

      return result;
    });
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
    await service.runAlbionScans();
    // eslint-disable-next-line
    expect((service as any).channel.send).toBeCalledTimes(2);
  });
});
