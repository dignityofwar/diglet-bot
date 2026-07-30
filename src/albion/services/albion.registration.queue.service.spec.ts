/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionRegistrationQueueService } from './albion.registration.queue.service';
import { DiscordService } from '../../discord/discord.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import {
  AlbionRegistrationQueueEntity,
  AlbionRegistrationQueueStatus,
} from '../../database/entities/albion.registration.queue.entity';
import { TestBootstrapper } from '../../test.bootstrapper';

const albionGuildId = TestBootstrapper.mockConfig.albion.guildId;
const registrationChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;
const discordGuildId = 'discord-guild-id';
const discordMemberId = '90078072660852736';
const characterName = 'Maelstromeous';

describe('AlbionRegistrationQueueService', () => {
  let service: AlbionRegistrationQueueService;
  let registrationsRepo: any;
  let queueRepo: any;
  let entityManager: any;
  let discordService: any;
  let discordMember: any;

  beforeEach(async () => {
    entityManager = TestBootstrapper.getMockEntityManager();

    registrationsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
    };

    queueRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => data),
      upsert: jest.fn().mockResolvedValue(undefined),
      nativeDelete: jest.fn().mockResolvedValue(0),
      getEntityManager: jest.fn().mockReturnValue(entityManager),
    };

    discordMember = { ...TestBootstrapper.getMockDiscordUser(), id: discordMemberId };

    discordService = {
      getGuildMember: jest.fn().mockResolvedValue(discordMember),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRegistrationQueueService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: DiscordService,
          useValue: discordService,
        },
        {
          provide: getRepositoryToken(AlbionRegistrationsEntity),
          useValue: registrationsRepo,
        },
        {
          provide: getRepositoryToken(AlbionRegistrationQueueEntity),
          useValue: queueRepo,
        },
      ],
    }).compile();

    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get(AlbionRegistrationQueueService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should queue a pending attempt without asking the Albion API', async () => {
    const result = await service.forceQueue(characterName, discordMemberId, discordGuildId);

    expect(queueRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        guildId: albionGuildId,
        discordGuildId,
        discordChannelId: registrationChannelId,
        discordId: discordMemberId,
        characterName,
        attemptCount: 0,
        status: AlbionRegistrationQueueStatus.PENDING,
      }),
    );
    expect(queueRepo.upsert).toHaveBeenCalledTimes(1);
    expect(result.requeued).toBe(false);
    expect(result.characterName).toBe(characterName);
  });

  it('should flag a new attempt as force queued so the retry cron rides out failures', async () => {
    await service.forceQueue(characterName, discordMemberId, discordGuildId);

    expect(queueRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ forceQueued: true }),
    );
  });

  it('should flag an existing attempt as force queued when re-queued', async () => {
    const existing = {
      discordId: discordMemberId,
      characterName: 'OldName',
      attemptCount: 12,
      expiresAt: new Date(0),
      forceQueued: false,
    } as any;

    queueRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    await service.forceQueue(characterName, discordMemberId, discordGuildId);

    expect(existing.forceQueued).toBe(true);
  });

  it('should expire the queued attempt 72 hours from now', async () => {
    const before = Date.now();

    const result = await service.forceQueue(characterName, discordMemberId, discordGuildId);

    const hours = (result.expiresAt.getTime() - before) / 1000 / 60 / 60;
    expect(hours).toBeGreaterThan(71.9);
    expect(hours).toBeLessThan(72.1);
  });

  it('should clear out previous failed attempts before queueing', async () => {
    await service.forceQueue(characterName, discordMemberId, discordGuildId);

    expect(queueRepo.nativeDelete).toHaveBeenCalledWith({
      guildId: albionGuildId,
      discordId: discordMemberId,
      discordGuildId,
      status: AlbionRegistrationQueueStatus.FAILED,
    });
  });

  it('should update an existing pending attempt rather than inserting a second one', async () => {
    const existing = {
      discordId: discordMemberId,
      characterName: 'OldName',
      attemptCount: 12,
      expiresAt: new Date(0),
      lastError: 'Character not found in guild yet.',
    } as any;

    // First findOne is the character-ownership check, second is the member's own pending attempt.
    queueRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existing);

    const result = await service.forceQueue(characterName, discordMemberId, discordGuildId);

    expect(queueRepo.create).not.toHaveBeenCalled();
    expect(queueRepo.upsert).not.toHaveBeenCalled();
    expect(entityManager.persist).toHaveBeenCalledWith(existing);
    expect(entityManager.flush).toHaveBeenCalledTimes(1);
    expect(existing.characterName).toBe(characterName);
    expect(existing.attemptCount).toBe(0);
    expect(result.requeued).toBe(true);
  });

  it('should throw when the Discord member is not on the server', async () => {
    discordService.getGuildMember.mockRejectedValue(new Error('Could not find member'));

    await expect(
      service.forceQueue(characterName, discordMemberId, discordGuildId),
    ).rejects.toThrow(`Discord member <@${discordMemberId}> could not be found on the server. Err: Could not find member`);

    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it('should throw when the Discord member is already registered', async () => {
    registrationsRepo.findOne.mockResolvedValueOnce({ characterName: 'SomeoneElse' });

    await expect(
      service.forceQueue(characterName, discordMemberId, discordGuildId),
    ).rejects.toThrow(`<@${discordMemberId}> is already registered as **SomeoneElse**.`);

    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it('should throw when the character is already registered to someone else', async () => {
    registrationsRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ discordId: '111', characterName });

    await expect(
      service.forceQueue(characterName, discordMemberId, discordGuildId),
    ).rejects.toThrow(`Character **${characterName}** is already registered to <@111>.`);

    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it('should throw when the character is already queued for a different member', async () => {
    queueRepo.findOne.mockResolvedValueOnce({ discordId: '111', characterName });

    await expect(
      service.forceQueue(characterName, discordMemberId, discordGuildId),
    ).rejects.toThrow(`Character **${characterName}** is already queued for <@111>. Resolve that attempt first.`);

    expect(queueRepo.create).not.toHaveBeenCalled();
  });

  it('should allow re-queueing a character already queued for the same member', async () => {
    queueRepo.findOne.mockResolvedValue({ discordId: discordMemberId, characterName } as any);

    await expect(
      service.forceQueue(characterName, discordMemberId, discordGuildId),
    ).resolves.toEqual(expect.objectContaining({ requeued: true }));
  });
});
