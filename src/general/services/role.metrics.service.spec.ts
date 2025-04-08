/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { DiscordService } from '../../discord/discord.service';
import { Logger } from '@nestjs/common';
import { TestBootstrapper } from '../../test.bootstrapper';
import { RoleList, RoleMetricsService } from './role.metrics.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { RoleMetricsEntity } from '../../database/entities/role.metrics.entity';
import { generateDateInPast } from '../../helpers';
import { Collection, Role, Snowflake } from 'discord.js';

describe('RoleMetricsService', () => {
  let roleMetricsService: RoleMetricsService;
  let discordService: DiscordService;

  let mockRoleMetricsRepository: any;
  let mockActivityRepository: any;

  let mockGuild: any;
  let mockChannel: any;
  let mockStatusMessage: any;

  const mockActivityEntity = {
    discordId: '123456',
    discordNickname: 'testuser',
    lastActivity: new Date(),
  } as ActivityEntity;
  const mockRoleMetricsEntity = {
    onboarded: 3,
    communityGames: {
      'Albion Online': 2,
      'Foxhole': 1,
    },
    recGames: {
      'Rec/BestGameEver': 3,
    },
    // Automatically generated properties
    createdAt: new Date(),
    updatedAt: new Date(),
    id: 1,
  } as RoleMetricsEntity;
  const mockActiveMembers = [
    {
      discordId: '123',
      discordNickname: 'testuser',
      lastActivity: generateDateInPast(4),
    } as ActivityEntity,
    {
      discordId: '234',
      discordNickname: 'anotheruser',
      lastActivity: generateDateInPast(2),
    } as ActivityEntity,
    {
      discordId: '345',
      discordNickname: 'anotheruser2',
      lastActivity: generateDateInPast(2),
    } as ActivityEntity,
    // Add inactive members
    {
      discordId: '345678',
      discordNickname: 'inactiveuser',
      lastActivity: generateDateInPast(92),
    } as ActivityEntity,
  ];
  const mockRoleList: RoleList = {
    onboardedRole: {
      id: TestBootstrapper.mockOnboardedRoleId,
      name: 'Onboarded',
    } as Role,
    communityGameRoles: new Collection<Snowflake, Role>([
      [TestBootstrapper.mockAlbionOnlineId, {
        id: TestBootstrapper.mockAlbionOnlineId,
        name: 'Albion Online',
      } as Role],
      [TestBootstrapper.mockFoxholeId, {
        id: TestBootstrapper.mockFoxholeId,
        name: 'Foxhole',
      } as Role],
    ]),
    recGameRoles: new Collection<Snowflake, Role>([
      [TestBootstrapper.mockRecPS2LeaderId, {
        id: TestBootstrapper.mockRecPS2LeaderId,
        name: 'Rec/PS2/Leader',
      } as Role],
      [TestBootstrapper.mockRecBestGameEverId, {
        id: TestBootstrapper.mockRecBestGameEverId,
        name: 'Rec/BestGameEver',
      } as Role],
    ]),
  };

  beforeEach(async () => {
    mockRoleMetricsRepository = TestBootstrapper.getMockRepositoryInjected(mockRoleMetricsEntity);
    mockActivityRepository = TestBootstrapper.getMockRepositoryInjected(mockActivityEntity);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoleMetricsService,
        {
          provide: DiscordService,
          useValue: {
            getAllRolesFromGuild: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RoleMetricsEntity),
          useValue: mockRoleMetricsRepository,
        },
        {
          provide: getRepositoryToken(ActivityEntity),
          useValue: mockActivityRepository,
        },

        Logger,
      ],
    }).compile();

    roleMetricsService = module.get<RoleMetricsService>(RoleMetricsService);
    discordService = module.get<DiscordService>(DiscordService);
    mockRoleMetricsRepository = module.get(getRepositoryToken(RoleMetricsEntity));
    mockActivityRepository = module.get(getRepositoryToken(ActivityEntity));
    mockGuild = TestBootstrapper.getMockGuild();

    mockStatusMessage = TestBootstrapper.getMockDiscordMessage();
    mockChannel = TestBootstrapper.getMockDiscordTextChannel();
    mockChannel.send = jest.fn().mockResolvedValue(mockStatusMessage);

    jest.spyOn(roleMetricsService['logger'], 'error');
    jest.spyOn(roleMetricsService['logger'], 'warn');
    jest.spyOn(roleMetricsService['logger'], 'log');
    jest.spyOn(roleMetricsService['logger'], 'debug');
  });

  describe('startEnumeration', () => {
    const mockReport = `## Role Metrics Report:
Stats as of April 5th 2025. All statistics state members who have the role AND are active <90d.
- Onboarded: **3**
- Community Games
  - Albion Online: **2**
  - Foxhole: **1**
- Rec Games
  - Rec/BestGameEver: **3**
`;

    beforeEach(() => {
      // Stubs
      roleMetricsService.enumerateRoleIds = jest.fn().mockResolvedValue(mockRoleList);
      roleMetricsService.enumerateRoleMetrics = jest.fn();

      mockRoleMetricsRepository.findOne = jest.fn().mockResolvedValue(mockRoleMetricsEntity);
    });

    it('should error if guild is not found', async () => {
      mockStatusMessage.channel.guild = null;
      roleMetricsService.enumerateRoleIds = jest.fn();

      await roleMetricsService.startEnumeration(mockStatusMessage);

      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Guild not found!');
      expect(roleMetricsService['logger'].error).toHaveBeenCalledWith('Guild not found!');
      expect(roleMetricsService.enumerateRoleIds).not.toHaveBeenCalled();
    });

    it('should call enumerateRoleIds', async () => {
      await roleMetricsService.startEnumeration(mockStatusMessage);

      expect(roleMetricsService.enumerateRoleIds).toHaveBeenCalled();
    });

    it('should call enumerateRoleMetrics', async () => {
      await roleMetricsService.startEnumeration(mockStatusMessage);

      expect(roleMetricsService.enumerateRoleMetrics).toHaveBeenCalled();
    });

    it('should handle errors during enumeration', async () => {
      roleMetricsService.enumerateRoleIds = jest.fn().mockRejectedValue(new Error('Enumeration error'));

      await roleMetricsService.startEnumeration(mockStatusMessage);

      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('Error enumerating role metrics. Error: Enumeration error');
      expect(roleMetricsService['logger'].error).toHaveBeenCalledWith('Error enumerating role metrics. Error: Enumeration error');
    });

    it('should error if there are no records', async () => {
      mockRoleMetricsRepository.findOne = jest.fn().mockResolvedValue([]);

      await roleMetricsService.startEnumeration(mockStatusMessage);

      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith('No role metrics found!');
      expect(roleMetricsService['logger'].error).toHaveBeenCalledWith('No role metrics found!');
    });

    it('should generate a report', async () => {
      await roleMetricsService.startEnumeration(mockStatusMessage);

      expect(mockStatusMessage.channel.send).toHaveBeenCalledWith(mockReport);

      expect(roleMetricsService['logger'].log).toHaveBeenCalledWith('Starting role metrics enumeration');
      expect(roleMetricsService['logger'].log).toHaveBeenCalledWith('Role metrics enumeration completed.');
    });
  });

  describe('enumerateRoleIds', () => {
    beforeEach(() => {
      discordService.getAllRolesFromGuild = jest.fn().mockResolvedValue(TestBootstrapper.getMockGuildRoleListCollection());
    });

    it('should return the onboarded role', async () => {
      const roles = await roleMetricsService.enumerateRoleIds(mockGuild);

      // Expect that the role Id "123456789012345678" (Onboarded) is included in the roles
      expect(roles.onboardedRole.id).toEqual(TestBootstrapper.mockOnboardedRoleId);
    });

    it('should filter out ignored rec game roles', async () => {
      const roles = await roleMetricsService.enumerateRoleIds(mockGuild);

      // Expect that the role Id "345678901234567890" (Rec/PS2/Leader) is not included in the Rec roles
      expect(roles.recGameRoles.get(TestBootstrapper.mockRecPS2LeaderId)).toBeUndefined();
    });

    it('should return correct community game roles', async () => {
      const roles = await roleMetricsService.enumerateRoleIds(mockGuild);

      // Expect that the role Id "123456789012345678" (Albion Online) is included in the roles
      expect(roles.communityGameRoles.get(TestBootstrapper.mockAlbionOnlineId)).toBeDefined();

      // Expect that the role Id "234567890123456789" (Foxhole) is included in the roles
      expect(roles.communityGameRoles.get(TestBootstrapper.mockFoxholeId)).toBeDefined();

      // Expect that the role Id "345678901234567890" (Rec/PS2/Leader) is not included in the roles
      expect(roles.communityGameRoles).not.toContain(TestBootstrapper.mockRecPS2LeaderId);
    });

    it('should return the correct rec game roles', async () => {
      const roles = await roleMetricsService.enumerateRoleIds(mockGuild);

      // Expect that the role Id "345678901234567890" (Rec/PS2/Leader) is NOT included in the roles
      expect(roles.recGameRoles.get(TestBootstrapper.mockRecPS2LeaderId)).toBeUndefined();

      // Expect the role ID "234567890123456789" (Rec/BestGameEver) is included in the roles
      expect(roles.recGameRoles.get(TestBootstrapper.mockRecBestGameEverId)).toBeDefined();

      // Expect the role ID "345678901234567891" (Albion Online) is NOT included in the roles
      expect(roles.recGameRoles.get(TestBootstrapper.mockAlbionOnlineId)).toBeUndefined();
    });
  });

  describe('enumerateRoleMetrics', () => {
    beforeEach(() => {
      roleMetricsService.getActiveMembers = jest.fn().mockResolvedValue(mockActiveMembers);

      // Re-mock the implementation for the guild.members.fetch as it is an overload of the concrete class.
      // We map here as well the membership of each member, as it's not stored anywhere other than on the Discord server itself, so we have to configure the users here.
      const mockMemberCollection = new Collection();
      const activeMemberRoleMappings = {
        '123': {
          [TestBootstrapper.mockOnboardedRoleId]: true,
          [TestBootstrapper.mockAlbionOnlineId]: true,
          [TestBootstrapper.mockFoxholeId]: true,
          [TestBootstrapper.mockRecPS2LeaderId]: true,
          [TestBootstrapper.mockRecBestGameEverId]: true,
        },
        '234': {
          [TestBootstrapper.mockOnboardedRoleId]: true,
          [TestBootstrapper.mockAlbionOnlineId]: true,
          [TestBootstrapper.mockFoxholeId]: false,
          [TestBootstrapper.mockRecPS2LeaderId]: false,
          [TestBootstrapper.mockRecBestGameEverId]: true,
        },
        '345': {
          [TestBootstrapper.mockOnboardedRoleId]: true,
          [TestBootstrapper.mockAlbionOnlineId]: false,
          [TestBootstrapper.mockFoxholeId]: false,
          [TestBootstrapper.mockRecPS2LeaderId]: false,
          [TestBootstrapper.mockRecBestGameEverId]: true,
        },
        // These should NOT be counted
        'inactive': {
          [TestBootstrapper.mockOnboardedRoleId]: true,
          [TestBootstrapper.mockAlbionOnlineId]: true,
          [TestBootstrapper.mockFoxholeId]: true,
          [TestBootstrapper.mockRecPS2LeaderId]: true,
          [TestBootstrapper.mockRecBestGameEverId]: true,
        },
      };
      const hasMockRole = (id: string, role: string) => {
        return activeMemberRoleMappings[id] && activeMemberRoleMappings[id][role];
      };
      mockActiveMembers.forEach(member => {
        mockMemberCollection.set(member.discordId, {
          id: member.discordId,
          roles: {
            cache: {
              has: jest.fn().mockImplementation((role: string) => {
                return hasMockRole(member.discordId, role);
              }),
            },
          },
        });
      });
      mockGuild.members.fetch = jest.fn().mockResolvedValue(mockMemberCollection);
    });

    it('should properly record the role metrics', async () => {
      await roleMetricsService.enumerateRoleMetrics(mockRoleList, mockGuild);

      expect(mockRoleMetricsRepository.getEntityManager().persistAndFlush).toHaveBeenCalledWith(expect.objectContaining({
        onboarded: 3,
        communityGames: {
          'Albion Online': 2,
          'Foxhole': 1,
        },
        recGames: {
          'Rec/BestGameEver': 3,
          'Rec/PS2/Leader': 1,
        },
      }));

      expect(roleMetricsService['logger'].log).toHaveBeenCalledWith('Starting role metrics enumeration...');
      expect(roleMetricsService['logger'].log).toHaveBeenCalledWith('Role metrics enumeration completed.');
    });
  });

  describe('getActiveMembers', () => {
    beforeEach(() => {
      mockActivityRepository.findAll = jest.fn().mockResolvedValue(mockActiveMembers);
    });

    it('should pull in active members from the database', async () => {
      const result = await roleMetricsService.getActiveMembers();

      expect(result.length).toEqual(2);
      expect(result[0].discordId).toEqual(mockActiveMembers[0].discordId);
      expect(result[1].discordId).toEqual(mockActiveMembers[1].discordId);
    });
  });
});