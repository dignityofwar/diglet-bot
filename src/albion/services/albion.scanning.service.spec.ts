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
      find: jest.fn().mockResolvedValueOnce([mockAlbionMember]),
      findAll: jest.fn().mockResolvedValue([mockAlbionMember]),
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
        send: jest.fn().mockImplementation(() => {
          return {
            edit: jest.fn(),
            delete: jest.fn(),
          };
        }),
      },
      edit: jest.fn(),
      delete: jest.fn(),
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
          scanPingRoles: [guildMasterRoleId, masterRoleId],
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

  // Execution flow
  it('should gracefully handle no members in the database by calling the reverse role scan', async () => {
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([]);
    service.reverseRoleScan = jest.fn().mockResolvedValue(undefined);
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toHaveBeenCalledWith('## ❌ No members were found in the database!\nStill running reverse role scan...');
    expect(service.reverseRoleScan).toBeCalledTimes(1);
  });
  it('should send number of members on record', async () => {
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([mockAlbionMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacter]);
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('ℹ️ There are currently 1 registered members on record.');
  });
  it('should handle errors with character gathering', async () => {
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([mockAlbionMember]);
    service.gatherCharacters = jest.fn().mockImplementation(() => {throw new Error('Operation went boom');});
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('## ❌ An error occurred while gathering data from the API!');
  });
  it('should error when no characters return from the API', async () => {
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([mockAlbionMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([]);
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('## ❌ No characters were gathered from the API!');
  });
  it('should properly relay errors from the remover or suggestions functions', async () => {
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([mockAlbionMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacter]);
    service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
    service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
    service.roleInconsistencies = jest.fn().mockImplementation(() => {
      throw new Error('Operation went boom');
    });
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('## ❌ An error occurred while scanning!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('Error: Operation went boom');
  });
  it('should probably relay scan progress', async () => {
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([mockAlbionMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacter]);
    service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
    service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
    service.roleInconsistencies = jest.fn().mockResolvedValueOnce([]);

    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('## Starting scan...');
    expect(mockDiscordMessage.edit).toBeCalledWith('## Task: [1/4] Gathering 1 characters from the ALB API...');
    expect(mockDiscordMessage.edit).toBeCalledWith('## Task: [2/4] Checking 1 characters for membership status...');
    expect(mockDiscordMessage.edit).toBeCalledWith('## Task: [3/4] Performing reverse role scan...');
    expect(mockDiscordMessage.edit).toBeCalledWith('## Task: [4/4] Checking for role inconsistencies...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scan complete!');
    expect(mockDiscordMessage.delete).toBeCalled();

    // Also expect functions to actually be called
    expect(service.gatherCharacters).toBeCalledTimes(1);
    expect(service.removeLeavers).toBeCalledTimes(1);
    expect(service.reverseRoleScan).toBeCalledTimes(1);
    expect(service.roleInconsistencies).toBeCalledTimes(1);
  });

  // Reverse role scanning
  it('reverse scan should properly error upon blank role', async () => {
    await expect(service.reverseRoleScan(mockDiscordMessage)).rejects.toThrowError('Reverse Role Scan: Role @ALB/Guildmaster does not seem to exist!');
  });
  it('reverse scan should properly error upon Discord role error', async () => {
    const errMsg = 'Discord don\'t like you';
    mockDiscordMessage.guild.roles.cache.get = jest.fn().mockImplementationOnce(() => {
      throw new Error(errMsg);
    });
    await expect(service.reverseRoleScan(mockDiscordMessage)).rejects.toThrowError(`Reverse Role Scan: Error fetching role @ALB/Guildmaster! Err: ${errMsg}`);
  });
  it('reverse scan should properly handle when no members were found for any roles', async () => {
    mockDiscordMessage.guild.roles.cache.get = jest.fn().mockImplementation(() => {
      return {
        members: [],
      };
    });
    await service.reverseRoleScan(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith('✅ No invalid users were detected via Reverse Role Scan.');
  });
  // Happy path
  it('reverse scan should properly detect an unregistered member who has a role they shouldn\'t', async () => {
    // Force the AlbionsMembersEntity to be empty
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([]);

    const mockedRoleToDelete = {
      name: 'ALB/Captain',
      id: captainRoleId,
      members: [
        [mockDiscordUser.id, mockDiscordUser],
      ],
    };

    // Mock the Discord API to return a list of Discord GuildMembers who have the Captain role
    mockDiscordMessage.guild.roles.cache.get = jest.fn()
      .mockImplementationOnce(() => mockedRoleToDelete)
      .mockImplementation((roleId: string) => {
        return {
          name: 'ALB/Foo',
          id: roleId,
          members: [],
        };
      });

    await service.reverseRoleScan(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('foo'); // For scanCountMessage
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanning 7 Discord roles for members who are falsely registered...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚨 1 invalid users detected via Reverse Role Scan!\nThese users have been **automatically** stripped of their roles.');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('foo'); // For invalid user line
    expect(mockDiscordUser.roles.remove).toBeCalledWith(mockedRoleToDelete);
  });
  it('reverse scan should return no change message properly', async () => {
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([mockAlbionMember]);

    const mockedRole = {
      name: 'ALB/Captain',
      id: captainRoleId,
      members: [],
    };

    // Mock the Discord API to return a list of Discord GuildMembers who have the Captain role
    mockDiscordMessage.guild.roles.cache.get = jest.fn()
      .mockImplementation(() => mockedRole);

    await service.reverseRoleScan(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('foo'); // For scanCountMessage
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanning 7 Discord roles for members who are falsely registered...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('✅ No invalid users were detected via Reverse Role Scan.');
  });

  // Remove leavers handling
  it('should properly handle server leavers', async () => {
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(2);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🫥️ Discord member for Character **${mockCharacter.Name}** has left the DIG server. Their registration status has been removed.`);
  });
  it('should properly handle zero server leavers', async () => {
    mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValueOnce(mockDiscordUser);

    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(1);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('✅ No leavers were detected.');
  });
  it('should properly handle guild leavers', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    await service.removeLeavers([mockCharacter], mockDiscordMessage);

    expect(mockDiscordMessage.channel.send).toBeCalledTimes(2);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild. Their roles and registration status have been stripped.`);
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

    await service.removeLeavers([mockCharacter], mockDiscordMessage);

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

    await service.removeLeavers([mockCharacter], mockDiscordMessage);

    expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`ERROR: Unable to remove Albion Character "${mockCharacter.Name}" (${mockCharacter.Id}) from registration database! Pinging <@${expectedDevUserId}>!`);
  });

  // Inconsistency scanner tests
  const testCases = [
    {
      title: 'Captain needs Initiate removed and missing Squire',
      roles: [captainRoleId, initiateRoleId, registeredRoleId],
      highestPriorityRole: { id: captainRoleId, name: captainName },
      expected: [
        { id: squireRoleId, name: squireName, action: 'added', message: '' },
        { id: initiateRoleId, name: initiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Guild Master having Initiate, Captain and General when they shouldn\'t',
      roles: [guildMasterRoleId, initiateRoleId, captainRoleId, generalRoleId, squireRoleId, registeredRoleId],
      highestPriorityRole: { id: guildMasterRoleId, name: guildMasterName },
      expected: [
        { id: generalRoleId, name: generalName, action: 'removed', message: '' },
        { id: captainRoleId, name: captainName, action: 'removed', message: '' },
        { id: initiateRoleId, name: initiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Guild Master requires Squire',
      roles: [guildMasterRoleId, registeredRoleId],
      highestPriorityRole: { id: guildMasterRoleId, name: guildMasterName },
      expected: [
        { id: squireRoleId, name: squireName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Master requires Squire',
      roles: [masterRoleId, registeredRoleId],
      highestPriorityRole: { id: masterRoleId, name: masterName },
      expected: [
        { id: squireRoleId, name: squireName, action: 'added', message: '' },
      ],
    },
    {
      title: 'General requires Squire',
      roles: [generalRoleId, registeredRoleId],
      highestPriorityRole: { id: generalRoleId, name: generalName },
      expected: [
        { id: squireRoleId, name: squireName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Captain requires Squire',
      roles: [captainRoleId, registeredRoleId],
      highestPriorityRole: { id: captainRoleId, name: captainName },
      expected: [
        { id: squireRoleId, name: squireName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Squire has no extra roles',
      roles: [squireRoleId, registeredRoleId],
      highestPriorityRole: { id: squireRoleId, name: squireName },
      expected: [],
    },
    {
      title: 'Initiate has no extra roles',
      roles: [initiateRoleId, registeredRoleId],
      highestPriorityRole: { id: initiateRoleId, name: initiateName },
      expected: [],
    },
    {
      title: 'Guild Masters should not have Initiate and should have Squire',
      roles: [guildMasterRoleId, squireRoleId, initiateRoleId, registeredRoleId],
      highestPriorityRole: { id: guildMasterRoleId, name: guildMasterName },
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Masters should not have Initiate and should have Squire',
      roles: [masterRoleId, squireRoleId, initiateRoleId, registeredRoleId],
      highestPriorityRole: { id: masterRoleId, name: masterName },
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Generals should not have Initiate and should have Squire',
      roles: [generalRoleId, squireRoleId, initiateRoleId, registeredRoleId],
      highestPriorityRole: { id: generalRoleId, name: generalName },
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Captains should not have Initiate and should have Squire',
      roles: [captainRoleId, squireRoleId, initiateRoleId, registeredRoleId],
      highestPriorityRole: { id: captainRoleId, name: captainName },
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Squires should not have Initiate',
      roles: [squireRoleId, initiateRoleId, registeredRoleId],
      highestPriorityRole: { id: squireRoleId, name: squireName },
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Squires should have registered role',
      roles: [squireRoleId],
      highestPriorityRole: { id: squireRoleId, name: squireName },
      expected: [
        { id: registeredRoleId, name: registeredName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Initiate should have registered role',
      roles: [initiateRoleId],
      highestPriorityRole: { id: initiateRoleId, name: initiateName },
      expected: [
        { id: registeredRoleId, name: registeredName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Registered people should have at least registered and initiate',
      roles: [],
      highestPriorityRole: { id: initiateRoleId, name: initiateName },
      expected: [
        { id: initiateRoleId, name: initiateName, action: 'added', message: '' },
        { id: registeredRoleId, name: registeredName, action: 'added', message: '' },
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

  const generateMessage = (testCase, expected) => {
    // Dynamically generate the expected message
    let emoji = '➕';
    let reason = `their highest role is **${testCase.highestPriorityRole.name}**, and the role is marked as "keep".`;

    if (expected.action === 'removed') {
      emoji = '➖';
      reason = `their highest role is **${testCase.highestPriorityRole.name}**, and the role is not marked as "keep".`;
    }

    if (testCase.roles.length === 0) {
      emoji = '⚠️';
      reason = 'they have no roles but are registered!';
    }

    return `- ${emoji} <@${mockDiscordUser.id}> requires role **${expected.name}** to be ${expected.action} because ${reason}`;
  };

  testCases.forEach(testCase => {
    it(`roleInconsistencies should correctly detect ${testCase.title}`, async () => {
      // Take the test case and fill in the expected messages, as it would be a PITA to define them at the array level
      testCase.expected.forEach((expected, i) => {
        testCase.expected[i].message = generateMessage(testCase, expected);
      });

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
        expect(r.message).toEqual(testCase.expected[i].message);
      });

      // Run it again except checking the messages it sends back
      await service.roleInconsistencies(mockDiscordMessage);

      if (testCase.expected.length === 0) {
        expect(mockDiscordMessage.channel.send).toBeCalledWith('✅ No role inconsistencies were detected.');
        return;
      }

      expect(mockDiscordMessage.channel.send).toBeCalledWith(`## 👀 ${result.length} role inconsistencies detected!`);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('---');
    });
  });
  it('roleInconsistencies should ensure certain people are excluded from scanning', async () => {
    mockDiscordUser.id = excludedScanUserId;
    setupRoleTestMocks([guildMasterRoleId, squireRoleId, initiateRoleId, registeredRoleId]); // Should require they remove initiate rank
    expect((await service.checkRoleInconsistencies(mockDiscordUser)).length).toEqual(0);
  });
  it('roleInconsistencies should still process non excluded users', async () => {
    setupRoleTestMocks([guildMasterRoleId, squireRoleId, initiateRoleId, registeredRoleId]); // Should require they remove initiate rank
    expect((await service.checkRoleInconsistencies(mockDiscordUser)).length).toEqual(1);
  });
  it('roleInconsistencies should properly indicate progress when multiple users are involved', async () => {
    mockAlbionMembersRepository.findAll = jest.fn().mockResolvedValueOnce([mockAlbionMember, mockAlbionMember, mockAlbionMember, mockAlbionMember, mockAlbionMember]);
    await service.roleInconsistencies(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanning 5 members for role inconsistencies... [0/5]');
    // Tried making it also check the scanCountMessage but that is an absolute brain melter as it's a new instance of the message object...
  });
});
