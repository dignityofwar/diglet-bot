/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { DiscordService } from '../../discord/discord.service';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import * as _ from 'lodash';
import { ConfigService } from '@nestjs/config';
import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
import { SnowflakeUtil } from 'discord.js';
import { AlbionScanningService } from './albion.scanning.service';
import { AlbionApiService } from './albion.api.service';
import { AlbionUtilities } from '../utilities/albion.utilities';

const expectedChannelId = '1234567890';
const expectedDevUserId = '1234575897';
const expectedGuildId = '56666666666';
const excludedScanUserId = '1337';

// Role constants
const guildMasterRoleId = '1158467537550454895';
const guildMasterName = '@ALB/Guildmaster';
const masterRoleId = '1158467574678429696';
const masterName = '@ALB/Master';
const generalRoleId = '1158467600687300699';
const generalName = '@ALB/General';
const captainRoleId = '1158467651165761626';
const captainName = '@ALB/Captain';
const squireRoleId = '1158467840496635914';
const squireName = '@ALB/Squire';
const initiateRoleId = '1139909152701947944';
const initiateName = '@ALB/Initiate';
const registeredRoleId = '1155987100928323594';
const registeredName = '@ALB/Registered';

describe('AlbionScanningService', () => {
  let service: AlbionScanningService;
  let config: ConfigService;

  let mockDiscordUser: any;
  let mockDiscordMessage: any;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockAlbionMember: AlbionMembersEntity;
  let mockAlbionMembersRepository: EntityRepository<AlbionMembersEntity>;
  let mockCharacter: AlbionPlayerInterface;

  beforeEach(async () => {
    mockEntityManager = {
      find: jest.fn(),
      persistAndFlush: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn(),
      }),
    } as any;

    mockAlbionMembersRepository = {
      find: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
      removeAndFlush: jest.fn(),
    } as any;
    const mockInit = jest.spyOn(MikroORM, 'init');

    // Now you can set your mock implementation
    mockInit.mockResolvedValue(Promise.resolve({
      em: mockEntityManager,
    } as any));

    // A mock instance of a Discord User
    mockDiscordUser = {
      displayName: 'mockuser',
      id: SnowflakeUtil.generate(),
      tag: 'TestUser#0000',
      username: 'TestUser',
      fetch: jest.fn(),
      roles: {
        add: jest.fn(),
        remove: jest.fn(),
        cache: {
          has: jest.fn(),
          get: jest.fn(),
        },
      },
    };

    mockDiscordUser.guild = {
      members: {
        fetch: jest.fn().mockImplementation(() => mockDiscordUser),
      },
      roles: {
        cache: {
          get: jest.fn(),
        },
      },
    } as any;

    mockAlbionMember = {
      id: 123456789,
      discordId: '123456789',
      characterId: '123456789',
      characterName: 'Maelstrome26',
      manual: false,
      manualCreatedByDiscordId: null,
      manualCreatedByDiscordName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AlbionMembersEntity;

    mockCharacter = {
      AverageItemPower: 1337,
      Id: '123456789',
      Name: 'TestUser',
      GuildId: expectedGuildId,
    } as any;

    mockDiscordMessage = {
      roles: {
        cache: {
          has: jest.fn(),
        },
      },
      guild: {
        members: {
          fetch: jest.fn().mockImplementation(() => mockDiscordUser),
        },
        roles: {
          cache: {
            get: jest.fn(),
          },
        },
      },
      channel: {
        send: jest.fn(),
      },
    } as any;

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionScanningService,
        ReflectMetadataProvider,
        AlbionApiService,
        AlbionUtilities,
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

    service = moduleRef.get<AlbionScanningService>(AlbionScanningService);
    config = moduleRef.get<ConfigService>(ConfigService);

    // Spy on the 'get' method of the ConfigService, and make it return a specific values based on the path
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        albion: {
          guildId: expectedGuildId,
          scanExcludedUsers: [excludedScanUserId],
          roleMap: [
            {
              name: guildMasterName,
              discordRoleId: guildMasterRoleId,
              priority: 1,
              keep: true,
            },
            {
              name: masterName,
              discordRoleId: masterRoleId,
              priority: 2,
              keep: false,
            },
            {
              name: generalName,
              discordRoleId: generalRoleId,
              priority: 3,
              keep: false,
            },
            {
              name: captainName,
              discordRoleId: captainRoleId,
              priority: 4,
              keep: false,
            },
            {
              name: squireName,
              discordRoleId: squireRoleId,
              priority: 5,
              keep: true,
            },
            {
              name: initiateName,
              discordRoleId: initiateRoleId,
              priority: 6,
              keep: false,
            },
            {
              name: registeredName,
              discordRoleId: registeredRoleId,
              priority: 6,
              keep: true,
            },
          ],
        },
        discord: {
          devUserId: expectedDevUserId,
          channels: {
            albionRegistration: expectedChannelId,
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

  const roles = [
    { id: '1158467537550454895', name: '@ALB/Guildmaster' },
    { id: '1158467574678429696', name: '@ALB/Master' },
    { id: '1158467840496635914', name: '@ALB/Squire' },
    { id: '1139909152701947944', name: '@ALB/Initiate' },
    { id: '1155987100928323594', name: '@ALB/Registered' },
  ];

  // Remove leavers handling
  it('should properly handle server leavers', async () => {

    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('User not found'));

    const result = await service.removeLeavers([mockCharacter], [mockAlbionMember], mockDiscordMessage);

    expect(result).toEqual([`- 🫥️ Discord member for Character **${mockCharacter.Name}** has left the DIG server. Their registration status has been removed.`]);
  });
  it('should properly handle guild leavers', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    const result = await service.removeLeavers([mockCharacter], [mockAlbionMember], mockDiscordMessage);

    expect(result).toEqual([`- 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild. Their roles and registration status have been stripped.`]);
  });
  it('should properly handle guild leavers and handle role errors', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    mockDiscordUser.roles.cache.has = jest.fn().mockImplementation(() => true);
    mockDiscordUser.roles.remove = jest.fn().mockRejectedValueOnce(new Error('Operation went boom'));
    mockDiscordMessage.guild.roles.cache.get = jest.fn().mockImplementation(() => {
      return {
        name: 'foobar',
      };
    });

    await service.removeLeavers([mockCharacter], [mockAlbionMember], mockDiscordMessage);

    expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`ERROR: Unable to remove role "foobar" from ${mockCharacter.Name} (${mockCharacter.Id}). Pinging <@${expectedDevUserId}>!`);
  });
  it('should properly handle guild leavers and handle database errors', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    mockDiscordUser.roles.cache.has = jest.fn().mockImplementation(() => true);
    mockDiscordMessage.guild.roles.cache.get = jest.fn().mockImplementation(() => {
      return {
        name: 'foobar',
      };
    });

    mockAlbionMembersRepository.removeAndFlush = jest.fn().mockRejectedValueOnce(new Error('Operation went boom'));

    await service.removeLeavers([mockCharacter], [mockAlbionMember], mockDiscordMessage);

    expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`ERROR: Unable to remove Albion Character "${mockCharacter.Name}" (${mockCharacter.Id}) from registration database! Pinging <@${expectedDevUserId}>!`);
  });

  // Inconsistency scanner tests
  const testCases = [
    {
      title: 'Captain having Initiate and missing Squire',
      roles: [captainRoleId, initiateRoleId, registeredRoleId],
      expected: [
        { id: squireRoleId, name: squireName, action: 'added' },
        { id: initiateRoleId, name: initiateName, action: 'removed' },
      ],
    },
    {
      title: 'Guild Master having Initiate, Captain and General when they shouldn\'t',
      roles: [guildMasterRoleId, initiateRoleId, captainRoleId, generalRoleId, squireRoleId, registeredRoleId],
      expected: [
        { id: generalRoleId, name: generalName, action: 'removed' },
        { id: captainRoleId, name: captainName, action: 'removed' },
        { id: initiateRoleId, name: initiateName, action: 'removed' },
      ],
    },
    {
      title: 'Guild Master requires Squire',
      roles: [guildMasterRoleId, registeredRoleId],
      expected: [
        { id: squireRoleId, name: squireName, action: 'added' },
      ],
    },
    {
      title: 'Master requires Squire',
      roles: [masterRoleId, registeredRoleId],
      expected: [
        { id: squireRoleId, name: squireName, action: 'added' },
      ],
    },
    {
      title: 'General requires Squire',
      roles: [generalRoleId, registeredRoleId],
      expected: [
        { id: squireRoleId, name: squireName, action: 'added' },
      ],
    },
    {
      title: 'Captain requires Squire',
      roles: [captainRoleId, registeredRoleId],
      expected: [
        { id: squireRoleId, name: squireName, action: 'added' },
      ],
    },
    {
      title: 'Squire has no extra roles',
      roles: [squireRoleId, registeredRoleId],
      expected: [],
    },
    {
      title: 'Initiate has no extra roles',
      roles: [initiateRoleId, registeredRoleId],
      expected: [],
    },
    {
      title: 'Guild Masters should not have Initiate and should have Squire',
      roles: [guildMasterRoleId, squireRoleId, initiateRoleId, registeredRoleId],
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed' },
      ],
    },
    {
      title: 'Masters should not have Initiate and should have Squire',
      roles: [masterRoleId, squireRoleId, initiateRoleId, registeredRoleId],
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed' },
      ],
    },
    {
      title: 'Generals should not have Initiate and should have Squire',
      roles: [generalRoleId, squireRoleId, initiateRoleId, registeredRoleId],
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed' },
      ],
    },
    {
      title: 'Captains should not have Initiate and should have Squire',
      roles: [captainRoleId, squireRoleId, initiateRoleId, registeredRoleId],
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed' },
      ],
    },
    {
      title: 'Squires should not have Initiate',
      roles: [squireRoleId, initiateRoleId, registeredRoleId],
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed' },
      ],
    },
    {
      title: 'Squires should have registered role',
      roles: [squireRoleId],
      expected: [
        { id: registeredRoleId, name: registeredName, action: 'added' },
      ],
    },
    {
      title: 'Initiate should have registered role',
      roles: [initiateRoleId],
      expected: [
        { id: registeredRoleId, name: registeredName, action: 'added' },
      ],
    },
    {
      title: 'Registered people should have at least registered and initiate',
      roles: [],
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'added' },
        { id: registeredRoleId, name: registeredName, action: 'added' },
      ],
    },
  ];

  const setupRoleTestMocks = (hasRoles: string[]) => {
    mockDiscordUser.roles.cache.has.mockImplementation((roleId: string) => hasRoles.includes(roleId));
    mockDiscordUser.guild.roles.cache.get = jest.fn().mockImplementation((roleId: string) => {
      const role = roles.find(r => r.id === roleId);
      return role ? { id: role.id, name: role.name } : null;
    });
  };

  testCases.forEach(testCase => {
    it(`should correctly detect ${testCase.title}`, async () => {
      setupRoleTestMocks(testCase.roles);
      const result = await service.checkRoleInconsistencies(mockDiscordUser);

      expect(result.length).toEqual(testCase.expected.length);

      if (result.length !== testCase.expected.length) {
        return;
      }

      result.forEach((r, i) => {
        expect(r.id).toEqual(testCase.expected[i].id);
        expect(r.name).toEqual(testCase.expected[i].name);
        expect(r.action).toEqual(testCase.expected[i].action);
        expect(r.message).toContain(testCase.expected[i].action);
      });
    });
  });
  it('should ensure certain people are excluded from scanning', async () => {
    mockDiscordUser.id = excludedScanUserId;
    setupRoleTestMocks([guildMasterRoleId, squireRoleId, initiateRoleId, registeredRoleId]); // Should require they remove initiate rank
    expect((await service.checkRoleInconsistencies(mockDiscordUser)).length).toEqual(0);
  });
  it('should still process non excluded users', async () => {
    setupRoleTestMocks([guildMasterRoleId, squireRoleId, initiateRoleId, registeredRoleId]); // Should require they remove initiate rank
    expect((await service.checkRoleInconsistencies(mockDiscordUser)).length).toEqual(1);
  });
});
