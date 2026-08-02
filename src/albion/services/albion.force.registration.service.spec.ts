/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import _ from 'lodash';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionForceRegistrationService } from './albion.force.registration.service';
import { AlbionApiService } from './albion.api.service';
import { DiscordService } from '../../discord/discord.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import {
  AlbionRegistrationQueueEntity,
  AlbionRegistrationQueueStatus,
} from '../../database/entities/albion.registration.queue.entity';
import { TestBootstrapper } from '../../test.bootstrapper';

const albionGuildId = TestBootstrapper.mockConfig.albion.guildId;
const registrationChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;
const discipleRoleId = TestBootstrapper.mockConfig.albion.roleMap.find((role) => role.name === '@ALB/Disciple').discordRoleId;
const discordGuildId = 'discord-guild-id';
const discordMemberId = '90078072660852736';
const characterName = 'Maelstromeous';
const characterId = 'character-id-123';

describe('AlbionForceRegistrationService', () => {
  let service: AlbionForceRegistrationService;
  let registrationsRepo: any;
  let queueRepo: any;
  let entityManager: any;
  let discordService: any;
  let albionApiService: any;
  let discordMember: any;
  let performedBy: any;
  let registrationChannel: any;
  let moduleRef: TestingModule;

  beforeEach(async () => {
    entityManager = TestBootstrapper.getMockEntityManager();

    registrationsRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockImplementation((data) => data),
      nativeDelete: jest.fn().mockResolvedValue(1),
      getEntityManager: jest.fn().mockReturnValue(entityManager),
    };

    queueRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      nativeDelete: jest.fn().mockResolvedValue(0),
      getEntityManager: jest.fn().mockReturnValue(entityManager),
    };

    discordMember = {
      ...TestBootstrapper.getMockDiscordUser(),
      id: discordMemberId,
      roles: { add: jest.fn().mockResolvedValue(undefined) },
      setNickname: jest.fn().mockResolvedValue(undefined),
    };

    performedBy = {
      ...TestBootstrapper.getMockDiscordUser(),
      id: 'staff-id',
      nickname: 'StaffPerson',
    };

    registrationChannel = {
      ...TestBootstrapper.getMockDiscordTextChannel(),
      send: jest.fn().mockResolvedValue(undefined),
    };

    discordService = {
      getGuildMember: jest.fn().mockResolvedValue(discordMember),
      getRoleViaMember: jest.fn().mockImplementation((_member, roleId) => Promise.resolve({ id: roleId })),
      getTextChannel: jest.fn().mockResolvedValue(registrationChannel),
    };

    albionApiService = {
      getCharacter: jest.fn().mockResolvedValue({
        Id: characterId,
        Name: characterName,
        GuildId: 'some-other-guild',
      }),
    };

    moduleRef = await Test.createTestingModule({
      providers: [
        AlbionForceRegistrationService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: DiscordService,
          useValue: discordService,
        },
        {
          provide: AlbionApiService,
          useValue: albionApiService,
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

    service = moduleRef.get(AlbionForceRegistrationService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should register a character that is not in the guild', async () => {
    const result = await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(registrationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discordId: discordMemberId,
        characterId,
        characterName,
        guildId: albionGuildId,
      }),
    );
    expect(entityManager.flush).toHaveBeenCalledTimes(1);
    expect(result).toEqual(expect.objectContaining({ characterName, characterId }));
  });

  it('should never consult the character guild when deciding to register', async () => {
    albionApiService.getCharacter.mockResolvedValue({
      Id: characterId,
      Name: characterName,
      GuildId: null,
    });

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).resolves.toEqual(expect.objectContaining({ characterName }));
  });

  it('should store the real character ID so the scan can still read the member back', async () => {
    await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(albionApiService.getCharacter).toHaveBeenCalledWith(characterName);
    expect(registrationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ characterId }),
    );
  });

  it('should record who forced the registration', async () => {
    await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(registrationsRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        manual: true,
        manualCreatedByDiscordId: 'staff-id',
        manualCreatedByDiscordName: 'StaffPerson',
      }),
    );
  });

  it('should apply the Disciple rank alongside the standard registration roles', async () => {
    await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    const appliedRoleIds = discordMember.roles.add.mock.calls.map(([role]) => role.id);

    expect(appliedRoleIds).toEqual([
      TestBootstrapper.mockConfig.discord.roles.albionMember,
      TestBootstrapper.mockConfig.discord.roles.albionRegistered,
      TestBootstrapper.mockConfig.discord.roles.albionAnnouncements,
      discipleRoleId,
    ]);
  });

  it('should set the member nickname to the character name', async () => {
    await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(discordMember.setNickname).toHaveBeenCalledWith(characterName);
  });

  it('should not fail the registration when the nickname cannot be set', async () => {
    discordMember.setNickname.mockRejectedValue(new Error('Missing permissions'));

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).resolves.toEqual(expect.objectContaining({ characterName }));
  });

  it('should mark a pending queue attempt as succeeded', async () => {
    const queued = {
      discordId: discordMemberId,
      characterName,
      status: AlbionRegistrationQueueStatus.PENDING,
      lastError: 'Character not detected in guild yet.',
    } as any;
    queueRepo.findOne.mockResolvedValue(queued);

    const result = await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(queued.status).toBe(AlbionRegistrationQueueStatus.SUCCEEDED);
    expect(queued.lastError).toBeNull();
    expect(entityManager.persist).toHaveBeenCalledWith(queued);
    expect(result.queueResolved).toBe(true);
  });

  it('should clear an older succeeded attempt so the status unique key cannot collide', async () => {
    queueRepo.findOne.mockResolvedValue({
      discordId: discordMemberId,
      status: AlbionRegistrationQueueStatus.PENDING,
    } as any);

    await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(queueRepo.nativeDelete).toHaveBeenCalledWith({
      guildId: albionGuildId,
      discordId: discordMemberId,
      status: AlbionRegistrationQueueStatus.SUCCEEDED,
    });
  });

  it('should not fail a committed registration when the queue cannot be closed out', async () => {
    queueRepo.findOne.mockResolvedValue({
      discordId: discordMemberId,
      status: AlbionRegistrationQueueStatus.PENDING,
    } as any);
    queueRepo.nativeDelete.mockRejectedValue(new Error('Duplicate entry'));

    const result = await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(result.queueResolved).toBe(false);
    expect(result.queueError).toBe('Duplicate entry');
  });

  it('should report no queue resolution when nothing was queued', async () => {
    const result = await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(result.queueResolved).toBe(false);
    expect(result.queueError).toBeUndefined();
    expect(queueRepo.nativeDelete).not.toHaveBeenCalled();
  });

  it('should announce the registration in the registration channel', async () => {
    await service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy);

    expect(discordService.getTextChannel).toHaveBeenCalledWith(registrationChannelId);
    expect(registrationChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(`<@${discordMemberId}>, your character **${characterName}** has been registered!`),
        allowedMentions: expect.objectContaining({ users: [discordMemberId] }),
      }),
    );
  });

  it('should still succeed when the announcement cannot be sent', async () => {
    discordService.getTextChannel.mockRejectedValue(new Error('no channel'));

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).resolves.toEqual(expect.objectContaining({ characterName }));
  });

  it('should throw when the Discord member is not on the server', async () => {
    discordService.getGuildMember.mockRejectedValue(new Error('Could not find member'));

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).rejects.toThrow(`Discord member <@${discordMemberId}> could not be found on the server. Err: Could not find member`);

    expect(registrationsRepo.create).not.toHaveBeenCalled();
  });

  it('should throw when the character cannot be looked up', async () => {
    albionApiService.getCharacter.mockRejectedValue(new Error('does not seem to exist'));

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).rejects.toThrow(`Could not look up character **${characterName}**. Err: does not seem to exist`);

    expect(registrationsRepo.create).not.toHaveBeenCalled();
  });

  it('should throw when the Discord member is already registered', async () => {
    registrationsRepo.findOne.mockResolvedValueOnce({ characterName: 'SomeoneElse' });

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).rejects.toThrow(`<@${discordMemberId}> is already registered as **SomeoneElse**.`);

    expect(discordMember.roles.add).not.toHaveBeenCalled();
    expect(registrationsRepo.create).not.toHaveBeenCalled();
  });

  it('should throw when the character is already registered to someone else', async () => {
    registrationsRepo.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ discordId: '111', characterName });

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).rejects.toThrow(`Character **${characterName}** is already registered to <@111>.`);

    expect(registrationsRepo.create).not.toHaveBeenCalled();
  });

  it('should throw when a role cannot be applied', async () => {
    discordService.getRoleViaMember.mockRejectedValue(new Error('Role does not exist'));

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).rejects.toThrow('Unable to add roles to');
  });

  it('should roll the registration row back when the roles cannot be applied', async () => {
    discordService.getRoleViaMember.mockRejectedValue(new Error('Role does not exist'));

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).rejects.toThrow('Unable to add roles to');

    expect(registrationsRepo.nativeDelete).toHaveBeenCalledWith({
      guildId: albionGuildId,
      discordId: discordMemberId,
    });
  });

  it('should throw when the Disciple rank is missing from the role map', async () => {
    const config = _.cloneDeep(TestBootstrapper.mockConfig);
    config.albion.roleMap = config.albion.roleMap.filter((role) => role.name !== '@ALB/Disciple');
    TestBootstrapper.setupConfig(moduleRef, config);

    await expect(
      service.forceRegister(characterName, discordMemberId, discordGuildId, performedBy),
    ).rejects.toThrow('Rank `@ALB/Disciple` is missing from the Albion role map!');

    expect(registrationsRepo.create).not.toHaveBeenCalled();
  });
});
