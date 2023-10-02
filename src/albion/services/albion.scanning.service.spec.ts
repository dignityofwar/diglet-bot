/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionRegistrationService } from './albion.registration.service';
import { DiscordService } from '../../discord/discord.service';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import * as _ from 'lodash';
import { ConfigService } from '@nestjs/config';
import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
import { SnowflakeUtil } from 'discord.js';
import { AlbionScanningService, RoleInconsistencyResult } from './albion.scanning.service';
import { jsJsx } from 'ts-loader/dist/constants';
import { AlbionApiService } from './albion.api.service';

const expectedChannelId = '1234567890';
const expectedDevUserId = '1234575897';
const expectedGuildId = '56666666666';

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

describe('AlbionScanningService', () => {
  let service: AlbionScanningService;
  let albionApiService: AlbionApiService;
  let discordService: DiscordService;
  let config: ConfigService;
  let albionMembersRepository: EntityRepository<AlbionMembersEntity>;

  let mockDiscordUser: any;
  let mockDiscordMessage: any;
  let mockCharacter: AlbionPlayerInterface;
  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockAlbionMember: AlbionMembersEntity;

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

    mockCharacter = {
      Id: '123456789',
      Name: 'TestCharacter',
      GuildId: expectedGuildId,
    } as any;

    // A mock instance of a Discord User
    mockDiscordUser = {
      displayName: 'mockuser',
      id: SnowflakeUtil.generate(),
      tag: 'TestUser#0000',
      username: 'TestUser',
      fetch: jest.fn(),
      roles: {
        add: jest.fn(),
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

    mockDiscordMessage = {
      edit: jest.fn(),
      send: jest.fn(),
      channel: {
        send: jest.fn(),
      },
      guild: {
        roles: {
          cache: {
            get: jest.fn(),
          },
        },
        members: {
          fetch: jest.fn().mockImplementation(() => mockDiscordUser),
        },
      },
    };

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

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionScanningService,
        ReflectMetadataProvider,
        AlbionApiService,
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
    albionApiService = moduleRef.get<AlbionApiService>(AlbionApiService);
    discordService = moduleRef.get<DiscordService>(DiscordService);
    config = moduleRef.get<ConfigService>(ConfigService);
    albionMembersRepository = moduleRef.get(getRepositoryToken(AlbionMembersEntity));

    // Spy on the 'get' method of the ConfigService, and make it return a specific values based on the path
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        albion: {
          guildGameId: expectedGuildId,
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
  ];

  const setupMocks = (hasRoles: string[]) => {
    mockDiscordUser.roles.cache.has.mockImplementation((roleId: string) => hasRoles.includes(roleId));
    mockDiscordUser.guild.roles.cache.get = jest.fn().mockImplementation((roleId: string) => {
      const role = roles.find(r => r.id === roleId);
      return role ? { id: role.id, name: role.name } : null;
    });
  };

  const runRolePriorityTest = async (hasRoles: string[], expectedInconsistencies: RoleInconsistencyResult[]) => {
    setupMocks(hasRoles);
    const result = await service.checkRoleInconsistencies(mockDiscordUser);
    expect(result).toEqual(expectedInconsistencies);
  };

  // Suggestions tests
  // it('should properly report back inconsistencies', async () => {
  //   service.checkRoleInconsistencies = jest.fn().mockImplementation(() => {
  //     return {
  //       inconsistentRoles: [
  //         { id: '1158467574678429696', name: '@ALB/Master' },
  //         { id: '1139909152701947944', name: '@ALB/Initiate' },
  //       ],
  //     };
  //   });
  //
  //   expect(await service.checkRoleInconsistencies(mockDiscordUser)).toEqual(
  // });

  // Inconsistency scanner tests
  it('should correctly calculate rank inconsistencies (Captain having Initiate and missing Squire)', async () => {
    await runRolePriorityTest([captainRoleId, initiateRoleId], [
      {
        id: squireRoleId,
        name: squireName,
        action: 'add',
      },
      {
        id: initiateRoleId,
        name: initiateName,
        action: 'remove',
      },
    ]);
  });
  it('should correctly calculate rank inconsistencies (Guild Master having Initiate, Captain and General when they shouldn\'t)', async () => {
    await runRolePriorityTest([guildMasterRoleId, initiateRoleId, captainRoleId, generalRoleId, squireRoleId], [
      {
        id: generalRoleId,
        name: generalName,
        action: 'remove',
      },
      {
        id: captainRoleId,
        name: captainName,
        action: 'remove',
      },
      {
        id: initiateRoleId,
        name: initiateName,
        action: 'remove',
      },
    ]);
  });
  // Add tests
  it('should identify Guild Master requires Squire', async () => {
    await runRolePriorityTest([guildMasterRoleId], [
      {
        id: squireRoleId,
        name: squireName,
        action: 'add',
      },
    ]);
  });
  it('should identify Master requires Squire', async () => {
    await runRolePriorityTest([masterRoleId], [
      {
        id: squireRoleId,
        name: squireName,
        action: 'add',
      },
    ]);
  });
  it('should identify General requires Squire', async () => {
    await runRolePriorityTest([generalRoleId], [
      {
        id: squireRoleId,
        name: squireName,
        action: 'add',
      },
    ]);
  });
  it('should identify Captain requires Squire', async () => {
    await runRolePriorityTest([captainRoleId], [
      {
        id: squireRoleId,
        name: squireName,
        action: 'add',
      },
    ]);
  });
  it('should identify Squire has no extra roles', async () => {
    await runRolePriorityTest([squireRoleId], []);
  });
  it('should identify Initiate has no extra roles', async () => {
    await runRolePriorityTest([squireRoleId], []);
  });
  // Removals
  it('should correctly identify that Guild Masters should not have Initiate and should have Squire', async () => {
    await runRolePriorityTest([guildMasterRoleId, squireRoleId, initiateRoleId], [
      {
        id: initiateRoleId,
        name: initiateName,
        action: 'remove',
      },
    ]);
  });
  it('should correctly identify that Masters should not have Initiate and should have Squire', async () => {
    await runRolePriorityTest([masterRoleId, squireRoleId, initiateRoleId], [
      {
        id: initiateRoleId,
        name: initiateName,
        action: 'remove',
      },
    ]);
  });
  it('should correctly identify that Generals should not have Initiate and should have Squire', async () => {
    await runRolePriorityTest([generalRoleId, squireRoleId, initiateRoleId], [
      {
        id: initiateRoleId,
        name: initiateName,
        action: 'remove',
      },
    ]);
  });
  it('should correctly identify that Captains should not have Initiate and should have Squire', async () => {
    await runRolePriorityTest([captainRoleId, squireRoleId, initiateRoleId], [
      {
        id: initiateRoleId,
        name: initiateName,
        action: 'remove',
      },
    ]);
  });
  it('should correctly identify that Squires should not have Initiate', async () => {
    await runRolePriorityTest([squireRoleId, initiateRoleId], [
      {
        id: initiateRoleId,
        name: initiateName,
        action: 'remove',
      },
    ]);
  });
});
