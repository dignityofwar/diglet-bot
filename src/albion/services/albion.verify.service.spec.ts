/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionVerifyService } from './albion.verify.service';
import { DiscordService } from '../../discord/discord.service';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import * as _ from 'lodash';
import { ConfigService } from '@nestjs/config';
import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { AlbionPlayersResponseInterface } from '../interfaces/albion.api.interfaces';
import { SnowflakeUtil } from 'discord.js';

const expectedChannelId = '1234567890';
const expectedRoleId = '987654321';
const expectedDevUserId = '1234575897';
const expectedGuildId = '56666666666';

describe('AlbionVerifyService', () => {
  let service: AlbionVerifyService;
  let discordService: DiscordService;
  let config: ConfigService;
  let albionMembersRepository: EntityRepository<AlbionMembersEntity>;

  let mockUser: any;
  let mockDiscordGuildMember: any;
  let mockInteraction: any;
  let mockCharacter: AlbionPlayersResponseInterface;
  let mockEntityManager: jest.Mocked<EntityManager>;

  beforeEach(async () => {
    mockEntityManager = {
      find: jest.fn(),
      persistAndFlush: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn(),
      }),
    } as any;

    const mockAlbionMembersRepository = {
      find: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    };
    const mockInit = jest.spyOn(MikroORM, 'init');

    // Now you can set your mock implementation
    mockInit.mockResolvedValue(Promise.resolve({
      em: mockEntityManager,
    } as any));

    // A mock instance of a Discord GuildMember
    mockDiscordGuildMember = {
      createdAt: new Date(),
      createdTimestamp: Date.now(),
      discriminator: '0000',
      displayName: 'TestUser',
      defaultAvatarURL: 'https://defaultavatar.url',
      id: SnowflakeUtil.generate(),
      tag: 'TestUser#0000',
      username: 'TestUser',
      fetch: jest.fn(),
      fetchFlags: jest.fn(),
      toString: jest.fn().mockReturnValue('<@userId>'), // Mocked
      setNickname: jest.fn().mockResolvedValue(() => true),
      roles: {
        add: jest.fn().mockResolvedValue(() => true),
      },
    };

    mockDiscordGuildMember.guild = {
      members: {
        fetch: jest.fn().mockImplementation(() => mockDiscordGuildMember),
      },
    } as any;

    mockCharacter = {
      data: {
        Id: '123456789',
        Name: 'TestCharacter',
        GuildId: expectedGuildId,
      },
    } as any;

    // A mock instance of a Discord User
    mockUser = {
      createdAt: new Date(),
      createdTimestamp: Date.now(),
      discriminator: '0000',
      defaultAvatarURL: 'https://defaultavatar.url',
      id: SnowflakeUtil.generate(),
      tag: 'TestUser#0000',
      username: 'TestUser',
      fetch: jest.fn(),
      fetchFlags: jest.fn(),
      toString: jest.fn().mockReturnValue('<@userId>'), // Mocked
      setNickname: jest.fn().mockResolvedValue(() => true),
      roles: {
        add: jest.fn(),
      },
    };

    mockInteraction = {
      channelId: expectedChannelId,
      guild: {
        roles: {
          fetch: jest.fn().mockReturnValue({ id: expectedRoleId }),
        },
        members: {
          fetch: jest.fn().mockReturnValue(mockUser),
        },
      },
      user: mockUser,
      member: mockUser,
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionVerifyService,
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
          provide: getRepositoryToken(AlbionMembersEntity),
          useValue: mockAlbionMembersRepository,
        },
      ],
    }).compile();

    service = moduleRef.get<AlbionVerifyService>(AlbionVerifyService);
    discordService = moduleRef.get<DiscordService>(DiscordService);
    config = moduleRef.get<ConfigService>(ConfigService);
    albionMembersRepository = moduleRef.get(getRepositoryToken(AlbionMembersEntity));

    // Spy on the 'get' method of the ConfigService, and make it return a specific values based on the path
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        albion: {
          guildGameId: expectedGuildId,
        },
        discord: {
          devUserId: expectedDevUserId,
          channels: {
            albionVerify: expectedChannelId,
          },
          roles: {
            albionInitiateRoleId: '123456789',
            albionVerifiedRoleId: '123456789',
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

  afterEach(() => {
    jest.resetAllMocks();
  });

  // Boostrap and initialization
  it('is defined', () => {
    expect(service).toBeDefined();
  });
  it('should throw an error if the channel could not be found', async () => {
    discordService.getChannel = jest.fn().mockReturnValue(null);

    await expect(service.onApplicationBootstrap()).rejects.toThrowError(`Could not find channel with ID ${expectedChannelId}`);
  });
  it('should throw an error if the channel is not text based', async () => {
    const channel = {
      isTextBased: jest.fn().mockReturnValue(false),
    };
    discordService.getChannel = jest.fn().mockReturnValue(channel);

    await expect(service.onApplicationBootstrap()).rejects.toThrowError(`Channel with ID ${expectedChannelId} is not a text channel`);
  });

  // Registration validation
  it('validation should return an error if the character has already been registered by another person (and member has left the server)', async () => {
    albionMembersRepository.find = jest.fn().mockResolvedValue([{
      discordId: '123456789',
    }]);
    discordService.getGuildMember = jest.fn().mockResolvedValue(null);

    await expect(service.isValidRegistrationAttempt(mockCharacter, mockDiscordGuildMember)).resolves.toBe(`⛔️ **ERROR:** Character **${mockCharacter.data.Name}** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the Albion Guild Masters.`);
  });
  it('validation should return an error if the character has already been registered by another person (but still on server)', async () => {
    albionMembersRepository.find = jest.fn().mockResolvedValue([{
      discordId: '123456789',
    }]);
    discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordGuildMember);

    await expect(service.isValidRegistrationAttempt(mockCharacter, mockDiscordGuildMember)).resolves.toBe(`⛔️ **ERROR:** Character **${mockCharacter.data.Name}** has already been registered by user \`@${mockDiscordGuildMember.displayName}\`. If you believe this to be in error, please contact the Albion Guild Masters.`);
  });
  it('validation should return an error if the user has already registered a character themselves', async () => {
    const discordMemberEntry = {
      discordId: mockDiscordGuildMember.id,
      characterName: 'TestCharacter',
    };
    albionMembersRepository.find = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([discordMemberEntry]);

    await expect(service.isValidRegistrationAttempt(mockCharacter, mockDiscordGuildMember)).resolves.toBe(`⛔️ **ERROR:** You have already registered a character named **${discordMemberEntry.characterName}**. We don't allow multiple characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or you have registered the wrong character, please contact the Albion Guild Masters.`);
  });
  it('validation should return true if no existing registration was found', async () => {
    albionMembersRepository.find = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(service.isValidRegistrationAttempt(mockCharacter, mockDiscordGuildMember)).resolves.toBe(true);
  });

  // Verification handling
  it('should handle characters that are not in the guild', async () => {
    service.isValidRegistrationAttempt = jest.fn().mockImplementation(() => true);
    mockCharacter.data.GuildId = 'utter nonsense';

    await expect(service.handleVerification(mockCharacter, mockInteraction)).resolves.toBe(`⛔️ **ERROR:** Your character **${mockCharacter.data.Name}** is not in the guild. If your character is in the guild, please ensure you have spelt the name **exactly** correct.`);
  });
  it('should handle discord role adding errors', async () => {
    service.isValidRegistrationAttempt = jest.fn().mockImplementation(() => true);
    discordService.getMemberRole = jest.fn().mockReturnValue({
      id: expectedRoleId,
    });
    mockInteraction.member.roles.add = jest.fn()
      .mockResolvedValueOnce(true)
      .mockImplementation(() => {
        throw new Error('Unable to add role');
      });
    await expect(service.handleVerification(mockCharacter, mockInteraction)).resolves.toBe(`⛔️ **ERROR:** Unable to add the \`@ALB/Initiate\` or \`@ALB/Registered\` roles to user! Pinging <@${expectedDevUserId}>!`);
  });
  it('should return thrown exception upon database error', async () => {
    service.isValidRegistrationAttempt = jest.fn().mockImplementation(() => true);
    discordService.getMemberRole = jest.fn().mockReturnValue({
      id: expectedRoleId,
    });
    mockInteraction.member.roles.add = jest.fn().mockReturnValue(true);
    albionMembersRepository.upsert = jest.fn().mockImplementation(() => {
      throw new Error('Database done goofed');
    });
    await expect(service.handleVerification(mockCharacter, mockInteraction)).resolves.toBe(`⛔️ **ERROR:** Unable to add you to the database! Pinging <@${expectedDevUserId}>! Err: Database done goofed`);
  });
  it('should handle discord nickname permission errors', async () => {
    service.isValidRegistrationAttempt = jest.fn().mockImplementation(() => true);
    discordService.getMemberRole = jest.fn().mockReturnValue({
      id: expectedRoleId,
    });
    mockInteraction.member.roles.add = jest.fn().mockReturnValue(true);
    mockInteraction.member.setNickname = jest.fn().mockImplementation(() => {
      throw new Error('Unable to set nickname');
    });
    await expect(service.handleVerification(mockCharacter, mockInteraction)).resolves.toBe(`⛔️ **ERROR:** Unable to set your nickname. If you're Staff this won't work as the bot has no power over you! Pinging <@${expectedDevUserId}>!`);
  });
});
