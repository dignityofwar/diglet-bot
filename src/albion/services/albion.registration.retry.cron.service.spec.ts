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

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRegistrationRetryCronService,
        {
          provide: DiscordService,
          useValue: {
            getTextChannel: jest.fn().mockResolvedValue(notificationChannel),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: AlbionRegistrationService,
          useValue: albionRegistrationService,
        },
        {
          provide: AlbionApiService,
          useValue: albionApiService,
        },
        {
          provide: getRepositoryToken(AlbionRegistrationQueueEntity),
          useValue: queueRepo,
        },
      ],
    }).compile();

    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get(AlbionRegistrationRetryCronService);

    jest.spyOn(service['logger'], 'log');
    jest.spyOn(service['logger'], 'error');
    jest.spyOn(service['logger'], 'warn');

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
});
