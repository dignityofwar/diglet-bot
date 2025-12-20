/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionRegistrationRetryCronService } from './albion.registration.retry.cron.service';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import {
  AlbionRegistrationQueueEntity,
  AlbionRegistrationQueueStatus,
} from '../../database/entities/albion.registration.queue.entity';
import { AlbionRegistrationService } from './albion.registration.service';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionServer } from '../interfaces/albion.api.interfaces';
import { AlbionApiService } from './albion.api.service';

describe('AlbionRegistrationRetryCronService', () => {
  let service: AlbionRegistrationRetryCronService;

  let queueRepo: any;
  let albionRegistrationService: any;
  let albionApiService: any;
  let notificationChannel: any;

  const setupModule = async (overrides?: {
    discordService?: any
    configService?: any
    registrationService?: any
    apiService?: any
    repo?: any
  }) => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRegistrationRetryCronService,
        {
          provide: DiscordService,
          useValue: overrides?.discordService ?? {
            getTextChannel: jest.fn().mockResolvedValue(notificationChannel),
          },
        },
        {
          provide: ConfigService,
          useValue: overrides?.configService ?? {
            get: jest.fn(),
          },
        },
        {
          provide: AlbionRegistrationService,
          useValue: overrides?.registrationService ?? albionRegistrationService,
        },
        {
          provide: AlbionApiService,
          useValue: overrides?.apiService ?? albionApiService,
        },
        {
          provide: getRepositoryToken(AlbionRegistrationQueueEntity),
          useValue: overrides?.repo ?? queueRepo,
        },
      ],
    }).compile();

    TestBootstrapper.setupConfig(moduleRef);
    return moduleRef;
  };

  beforeEach(async () => {
    // The cron service calls channel.isTextBased() and then channel.send(...)
    notificationChannel = {
      ...TestBootstrapper.getMockDiscordTextChannel(),
      isTextBased: jest.fn().mockReturnValue(true),
    } as any;

    queueRepo = {
      find: jest.fn(),
      findOne: jest.fn(),
      getEntityManager: jest.fn().mockReturnValue({
        flush: jest.fn().mockResolvedValue(true),
      }),
    };

    albionRegistrationService = {
      handleRegistration: jest.fn(),
    };

    albionApiService = {
      getAllGuildMembers: jest.fn().mockResolvedValue([]),
    };

    const moduleRef = await setupModule();

    service = moduleRef.get(AlbionRegistrationRetryCronService);

    jest.spyOn(service['logger'], 'log');
    jest.spyOn(service['logger'], 'error');
    jest.spyOn(service['logger'], 'warn');

    // Ensure send can be asserted / forced to fail.
    notificationChannel.send = jest.fn().mockResolvedValue(true);

    await service.onApplicationBootstrap();
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should ignore when no due attempts exist', async () => {
    queueRepo.find.mockResolvedValue([]);

    await service.retryAlbionRegistrations();

    expect(albionRegistrationService.handleRegistration).not.toHaveBeenCalled();
  });

  it('should mark attempt succeeded when registration succeeds', async () => {
    const attempt = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    queueRepo.find.mockResolvedValue([attempt]);
    albionApiService.getAllGuildMembers.mockResolvedValue([{ Name: 'Char' }]);
    albionRegistrationService.handleRegistration.mockResolvedValue(undefined);

    await service.retryAlbionRegistrations();

    const expectedSummary = 'Albion registration queue retry attempt: checking 1 character(s):\n\n- **Char**';
    expect(notificationChannel.send).toHaveBeenCalledWith(expectedSummary);

    expect(albionRegistrationService.handleRegistration).toHaveBeenCalledWith(
      'Char',
      AlbionServer.EUROPE,
      'u1',
      'dg1',
      'dc1',
    );
    expect(attempt.status).toBe(AlbionRegistrationQueueStatus.SUCCEEDED);
  });

  it('should not attempt registration when character is not in guild member list', async () => {
    const attempt = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    queueRepo.find.mockResolvedValue([attempt]);
    albionApiService.getAllGuildMembers.mockResolvedValue([{ Name: 'Other' }]);

    await service.retryAlbionRegistrations();

    expect(albionRegistrationService.handleRegistration).not.toHaveBeenCalled();
    expect(attempt.status).toBe(AlbionRegistrationQueueStatus.PENDING);
    expect(attempt.lastError).toContain('not found in guild member list');
    expect(attempt.attemptCount).toBe(1);
  });

  it('should keep attempt pending when there\'s no detection the registration attempt', async () => {
    const attempt = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    queueRepo.find.mockResolvedValue([attempt]);
    albionApiService.getAllGuildMembers.mockResolvedValue([{ Name: 'Char' }]);
    albionRegistrationService.handleRegistration.mockRejectedValue(
      new Error('has not been detected in'),
    );

    await service.retryAlbionRegistrations();

    expect(attempt.status).toBe(AlbionRegistrationQueueStatus.PENDING);
    expect(attempt.attemptCount).toBe(1);
  });

  it('should expire attempt and notify when expiresAt has passed', async () => {
    const attempt = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() - 1000),
    });

    queueRepo.find.mockResolvedValue([attempt]);

    await service.retryAlbionRegistrations();

    expect(attempt.status).toBe(AlbionRegistrationQueueStatus.EXPIRED);
    expect(service['notificationChannel'].send).toHaveBeenCalledWith(
      '⏰ <@u1> your registration attempt timed out. You are either truly not in the guild, or there is another problem. If you are in the guild, you are recommended to play the game for at least 1 hour, then retry registration. If you are not in the guild, then... why are you trying? :P',
    );
  });

  it('should post a retry summary with a list of characters', async () => {
    const attempt1 = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char1',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    const attempt2 = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u2',
      characterName: 'Char2',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    queueRepo.find.mockResolvedValue([attempt1, attempt2]);
    albionApiService.getAllGuildMembers.mockResolvedValue([]);

    await service.retryAlbionRegistrations();

    expect(notificationChannel.send).toHaveBeenCalledWith(
      'Albion registration queue retry attempt: checking 2 character(s):\n\n- **Char1**\n- **Char2**',
    );
  });

  it('should increment attemptCount across subsequent retry runs', async () => {
    const attempt = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    // Always pending and always not in guild list.
    queueRepo.find.mockResolvedValue([attempt]);
    albionApiService.getAllGuildMembers.mockResolvedValue([{ Name: 'Other' }]);

    await service.retryAlbionRegistrations();
    expect(attempt.attemptCount).toBe(1);

    await service.retryAlbionRegistrations();
    expect(attempt.attemptCount).toBe(2);

    expect(albionRegistrationService.handleRegistration).not.toHaveBeenCalled();
    expect(attempt.status).toBe(AlbionRegistrationQueueStatus.PENDING);
  });

  it('should increment attemptCount when getAllGuildMembers throws', async () => {
    const attempt = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    queueRepo.find.mockResolvedValue([attempt]);
    albionApiService.getAllGuildMembers.mockRejectedValue(new Error('bad response'));

    await service.retryAlbionRegistrations();

    expect(attempt.attemptCount).toBe(1);
    expect(attempt.lastError).toContain('Failed to fetch guild members');
    expect(albionRegistrationService.handleRegistration).not.toHaveBeenCalled();
  });

  it('should mark attempt failed and notify when handleRegistration errors with a non-retryable response', async () => {
    const attempt = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    queueRepo.find.mockResolvedValue([attempt]);
    albionApiService.getAllGuildMembers.mockResolvedValue([{ Name: 'Char' }]);
    albionRegistrationService.handleRegistration.mockRejectedValue(new Error('some hard failure'));

    await service.retryAlbionRegistrations();

    expect(attempt.status).toBe(AlbionRegistrationQueueStatus.FAILED);
    expect(notificationChannel.send).toHaveBeenCalledWith(
      expect.stringContaining('Albion registration retry failed for <@u1>'),
    );
  });

  it('should log an error when retry summary cannot be sent', async () => {
    const attempt = new AlbionRegistrationQueueEntity({
      guildId: 'g1',
      discordGuildId: 'dg1',
      discordChannelId: 'dc1',
      discordId: 'u1',
      characterName: 'Char',
      server: AlbionServer.EUROPE,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60),
    });

    queueRepo.find.mockResolvedValue([attempt]);
    albionApiService.getAllGuildMembers.mockResolvedValue([]);

    (notificationChannel.send as jest.Mock).mockRejectedValueOnce(new Error('discord down'));

    await service.retryAlbionRegistrations();

    expect(service['logger'].error).toHaveBeenCalledWith('Failed to send retry summary: discord down');
  });

  it('should throw on bootstrap if notification channel cannot be loaded', async () => {
    const moduleRef = await setupModule({
      discordService: {
        getTextChannel: jest.fn().mockResolvedValue(null),
      },
    });

    const localService = moduleRef.get(AlbionRegistrationRetryCronService);

    await expect(localService.onApplicationBootstrap()).rejects.toThrow(
      'Could not find channel with ID',
    );
  });

  it('should throw on bootstrap if notification channel is not text-based', async () => {
    const nonTextChannel: any = {
      isTextBased: jest.fn().mockReturnValue(false),
    };

    const moduleRef = await setupModule({
      discordService: {
        getTextChannel: jest.fn().mockResolvedValue(nonTextChannel),
      },
    });

    const localService = moduleRef.get(AlbionRegistrationRetryCronService);

    await expect(localService.onApplicationBootstrap()).rejects.toThrow(
      'is not a text channel for Albion retry cron',
    );
  });
});
