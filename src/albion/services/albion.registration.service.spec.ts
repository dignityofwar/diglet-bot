/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionRegistrationService } from './albion.registration.service';
import { DiscordService } from '../../discord/discord.service';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EntityRepository } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { AlbionApiService } from './albion.api.service';

const mockRegistrationChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;
const mockAlbionInitiateRoleId = TestBootstrapper.mockConfig.discord.roles.albionInitiateRoleId;
const mockDevUserId = TestBootstrapper.mockConfig.discord.devUserId;

describe('AlbionRegistrationService', () => {
  let service: AlbionRegistrationService;
  let discordService: DiscordService;
  let albionApiService: AlbionApiService;

  let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;
  let mockCharacter: AlbionPlayerInterface;
  let mockDiscordUser: any;
  let mockDiscordMessage: any;
  const mockDto: AlbionRegisterDto = { character: 'Maelstrome26' };

  beforeEach(async () => {
    TestBootstrapper.mockORM();
    mockAlbionRegistrationsRepository = TestBootstrapper.getMockEntityRepo();
    mockCharacter = TestBootstrapper.getMockAlbionCharacter(TestBootstrapper.mockConfig.albion.guildId) as any;
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockDiscordMessage = TestBootstrapper.getMockDiscordMessage();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRegistrationService,
        ReflectMetadataProvider,
        {
          provide: DiscordService,
          useValue: {
            getChannel: jest.fn(),
            getMemberRole: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: AlbionApiService,
          useValue: {
            getCharacter: jest.fn().mockImplementation(() => mockCharacter),
          },
        },
        {
          provide: getRepositoryToken(AlbionRegistrationsEntity),
          useValue: mockAlbionRegistrationsRepository,
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<AlbionRegistrationService>(AlbionRegistrationService);
    discordService = moduleRef.get<DiscordService>(DiscordService);
    albionApiService = moduleRef.get<AlbionApiService>(AlbionApiService);

  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // Boostrap and initialization
  it('is defined', () => {
    expect(service).toBeDefined();
  });
  it('should throw an error if the channel could not be found', async () => {
    discordService.getChannel = jest.fn().mockReturnValue(null);

    await expect(service.onApplicationBootstrap()).rejects.toThrowError(`Could not find channel with ID ${mockRegistrationChannelId}`);
  });
  it('should throw an error if the channel is not text based', async () => {
    const channel = {
      isTextBased: jest.fn().mockReturnValue(false),
    };
    discordService.getChannel = jest.fn().mockReturnValue(channel);

    await expect(service.onApplicationBootstrap()).rejects.toThrowError(`Channel with ID ${mockRegistrationChannelId} is not a text channel`);
  });

  // Registration validation
  it('should throw an error if one of the roles is missing ', async () => {
    discordService.getMemberRole = jest.fn()
      .mockReturnValueOnce({
        id: mockAlbionInitiateRoleId,
      })
      .mockImplementationOnce(() => {
        throw new Error('Role not found');
      });

    await expect(service.validateRegistrationAttempt(mockCharacter, mockDiscordUser)).rejects.toThrowError(`Required Role(s) do not exist! Pinging <@${mockDevUserId}>! Err: Role not found`);
  });

  it('validation should return an error if the character has already been registered by another person (and member has left the server)', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValue([{
      discordId: '123456789',
    }]);
    discordService.getGuildMember = jest.fn().mockResolvedValue(null);

    await expect(service.validateRegistrationAttempt(mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the Albion Guild Masters.`);
  });
  it('validation should return an error if the character has already been registered by another person (but still on server)', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValue([{
      discordId: '123456789',
    }]);
    discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser);

    await expect(service.validateRegistrationAttempt(mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered by Discord user \`@${mockDiscordUser.displayName}\`. If this is you, you don't need to do anything. If you believe this to be in error, please contact the Albion Guild Masters.`);
  });
  it('validation should return an error if the user has already registered a character themselves', async () => {
    const discordMemberEntry = {
      discordId: mockDiscordUser.id,
      characterName: 'TestCharacter',
    };
    mockAlbionRegistrationsRepository.find = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([discordMemberEntry]);

    await expect(service.validateRegistrationAttempt(mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, you have already registered a character named **${discordMemberEntry.characterName}**. We don't allow multiple characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or if you have registered the wrong character, please contact the Albion Guild Masters.`);
  });
  it('validation should return true if no existing registration was found', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(service.validateRegistrationAttempt(mockCharacter, mockDiscordUser)).resolves.toBe(true);
  });
  it('should handle characters that are not in the guild', async () => {
    mockCharacter.GuildId = 'utter nonsense';

    await expect(service.validateRegistrationAttempt(mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, the character **${mockCharacter.Name}** has not been detected in the DIG guild. Please ensure that:\n
1. You have spelt the name **exactly** correct (case sensitive).
2. You are a member of the "DIG - Dignity of War" guild in the game before trying again.
\nIf you have just joined us, please wait ~10 minutes. If you are still having issues, please contact the Albion Guild Masters.`);
  });

  // Registration handling
  it('should handle discord role adding errors', async () => {
    service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
    discordService.getMemberRole = jest.fn().mockReturnValue({
      id: mockAlbionInitiateRoleId,
    });
    mockDiscordUser.roles.add = jest.fn()
      .mockResolvedValueOnce(true)
      .mockImplementation(() => {
        throw new Error('Unable to add role');
      });
    await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).rejects.toThrowError(`Unable to add registration role(s) to "${mockDiscordUser.displayName}"! Pinging <@${mockDevUserId}>!\nErr: Unable to add role`);
  });
  it('should return thrown exception upon database error', async () => {
    service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
    discordService.getMemberRole = jest.fn().mockReturnValue({
      id: mockAlbionInitiateRoleId,
    });
    mockAlbionRegistrationsRepository.upsert = jest.fn().mockImplementation(() => {
      throw new Error('Database done goofed');
    });
    await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).rejects.toThrowError(`Unable to add you to the database! Pinging <@${mockDevUserId}>! Err: Database done goofed`);
  });
  it('should handle discord nickname permission errors', async () => {
    service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
    discordService.getMemberRole = jest.fn().mockReturnValue({
      id: mockAlbionInitiateRoleId,
    });
    mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
    mockDiscordUser.setNickname = jest.fn().mockImplementation(() => {
      throw new Error('Unable to set nickname');
    });
    await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).resolves.toBe(undefined);
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`⚠️ Unable to set your nickname. If you're Staff this won't work as the bot has no power over you! Pinging <@${mockDevUserId}>!`);
  });
  it('should properly handle getCharacter errors, mentioning the user', async () => {
    const errorMsg = 'Some error from the API service';
    albionApiService.getCharacter = jest.fn().mockImplementation(() => {
      throw new Error(errorMsg);
    });
    await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, ${errorMsg}`);
  });

  // Edge case handling
  it('should handle successful registrations and return a message to the user', async () => {
    service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
    discordService.getMemberRole = jest.fn().mockReturnValue({
      id: mockAlbionInitiateRoleId,
    });
    mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
    mockDiscordUser.setNickname = jest.fn().mockImplementation(() => {
      true;
    });

    await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).resolves.toBe(undefined);

    const mockMasterRoleId = TestBootstrapper.mockConfig.albion.masterRole.discordRoleId;
    const mockGuildMasterRoleId = TestBootstrapper.mockConfig.albion.guildMasterRole.discordRoleId;

    expect(mockDiscordMessage.channel.send).toBeCalledWith({
      content: `## ✅ Thank you <@${mockDiscordUser.id}>, your character **${mockCharacter.Name}** has been verified! 🎉

* ➡️ Please read the information within <#${TestBootstrapper.mockConfig.discord.channels.albionInfopoint}> to be fully acquainted with the guild!
* 👉️ **IMPORTANT**: [Grab opt-in roles for various content you're interested in](https://discord.com/channels/90078410642034688/1039269859814559764)!
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${TestBootstrapper.mockConfig.discord.channels.albionTownCrier}> announcements channel. If you wish to opt out, go to the [#welcome-to-albion](https://discord.com/channels/90078410642034688/1039268966905954394/1204480244405243954) channel, double tap the 🔔 icon.

CC <@&${mockMasterRoleId}>, <@&${mockGuildMasterRoleId}>`,
      flags: 4,
    });
    expect(mockDiscordMessage.delete).toBeCalled();
  });
});
