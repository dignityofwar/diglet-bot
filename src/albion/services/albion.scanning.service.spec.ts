/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { DiscordService } from '../../discord/discord.service';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EntityRepository } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';
import { AlbionScanningService } from './albion.scanning.service';
import { AlbionApiService } from './albion.api.service';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { AlbionGuildMembersEntity } from '../../database/entities/albion.guildmembers.entity';
import { TestBootstrapper } from '../../test.bootstrapper';

const mockDevUserId = TestBootstrapper.mockConfig.discord.devUserId;
const mockScanUserId = '1337';

// Role constants
const mockGuildUSLeaderRoleId = '1158467537550454895';
const mockGuildUSLeaderRoleName = '@ALB/US/Guildmaster';
const mockGuildUSOfficerRoleId = '1158467574678429696';
const mockUSOfficerRoleName = '@ALB/US/Master';
const mockGeneralRoleId = '1158467600687300699';
const mockGeneralName = '@ALB/US/General';
const mockCaptainRoleId = '1158467651165761626';
const mockCaptainName = '@ALB/US/Captain';
const mockSquireRoleId = '1158467840496635914';
const mockSquireName = '@ALB/US/Squire';
const mockInitiateRoleId = '1139909152701947944';
const mockInitiateName = '@ALB/US/Initiate';
const mockRegisteredRoleId = '1155987100928323594';
const mockRegisteredName = '@ALB/US/Registered';

describe('AlbionScanningService', () => {
  let service: AlbionScanningService;
  let mockDiscordUser: any;
  let mockDiscordMessage: any;
  let mockRegisteredMember: AlbionRegistrationsEntity;
  let mockAlbionGuildMember: AlbionGuildMembersEntity;
  let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;
  let mockAlbionGuildMembersRepository: EntityRepository<AlbionGuildMembersEntity>;
  let mockCharacter: AlbionPlayerInterface;

  beforeEach(async () => {
    mockCharacter = TestBootstrapper.getMockAlbionCharacter(TestBootstrapper.mockConfig.albion.guildIdAmericas);
    mockRegisteredMember = {
      id: 123456789,
      discordId: '123456789',
      characterId: mockCharacter.Id,
      characterName: mockCharacter.Name,
      manual: false,
      manualCreatedByDiscordId: null,
      manualCreatedByDiscordName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AlbionRegistrationsEntity;
    mockAlbionGuildMember = {
      id: 123456789,
      characterId: mockCharacter.Id,
      characterName: mockCharacter.Name,
      registered: false,
      warned: false,
    } as AlbionGuildMembersEntity;

    mockAlbionRegistrationsRepository = TestBootstrapper.getMockRepositoryInjected(mockRegisteredMember);
    mockAlbionGuildMembersRepository = TestBootstrapper.getMockRepositoryInjected(mockAlbionGuildMember);
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockDiscordMessage = TestBootstrapper.getMockDiscordMessage();

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
          provide: getRepositoryToken(AlbionRegistrationsEntity),
          useValue: mockAlbionRegistrationsRepository,
        },
        {
          provide: getRepositoryToken(AlbionGuildMembersEntity),
          useValue: mockAlbionGuildMembersRepository,
        },
      ],
    }).compile();

    service = moduleRef.get<AlbionScanningService>(AlbionScanningService);

    const albionMerged = {
      ...TestBootstrapper.mockConfig.albion,
      ...{
        scanExcludedUsers: [mockScanUserId],
        scanPingRoles: [mockGuildUSLeaderRoleId, mockGuildUSOfficerRoleId],
        roleMap: [
          {
            name: mockGuildUSLeaderRoleName,
            discordRoleId: mockGuildUSLeaderRoleId,
            priority: 1,
            keep: true,
          },
          {
            name: mockUSOfficerRoleName,
            discordRoleId: mockGuildUSOfficerRoleId,
            priority: 2,
            keep: false,
          },
          {
            name: mockGeneralName,
            discordRoleId: mockGeneralRoleId,
            priority: 3,
            keep: false,
          },
          {
            name: mockCaptainName,
            discordRoleId: mockCaptainRoleId,
            priority: 4,
            keep: false,
          },
          {
            name: mockSquireName,
            discordRoleId: mockSquireRoleId,
            priority: 5,
            keep: true,
          },
          {
            name: mockInitiateName,
            discordRoleId: mockInitiateRoleId,
            priority: 6,
            keep: false,
          },
          {
            name: mockRegisteredName,
            discordRoleId: mockRegisteredRoleId,
            priority: 6,
            keep: true,
          },
        ],
      },
    };
    const fulLData = {
      ...TestBootstrapper.mockConfig,
      albion: albionMerged,
    };

    TestBootstrapper.setupConfig(moduleRef, fulLData);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // Boostrap and initialization
  it('is defined', () => {
    expect(service).toBeDefined();
  });

  const roles = [
    { id: '1158467537550454895', name: '@ALB/US/Guildmaster' },
    { id: '1158467574678429696', name: '@ALB/US/Master' },
    { id: '1158467840496635914', name: '@ALB/US/Squire' },
    { id: '1139909152701947944', name: '@ALB/US/Initiate' },
    { id: '1155987100928323594', name: '@ALB/US/Registered' },
  ];

  // Execution flow
  it('should gracefully handle no members in the database by calling the reverse role scan', async () => {
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([]);
    service.reverseRoleScan = jest.fn().mockResolvedValue(undefined);
    service.discordEnforcementScan = jest.fn().mockResolvedValue(undefined);

    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toHaveBeenCalledWith('# Starting scan...');
    expect(mockDiscordMessage.edit).toHaveBeenCalledWith('## ❌ No members were found in the database!\nStill running reverse role and Discord enforcement scans...');
    expect(mockDiscordMessage.edit).toHaveBeenCalledWith('# Task: [1/2] Performing reverse role scan...');
    expect(mockDiscordMessage.edit).toHaveBeenCalledWith('# Task: [2/2] Discord enforcement scan...');

    expect(service.reverseRoleScan).toBeCalledTimes(1);
    // expect(service.discordEnforcementScan).toBeCalledTimes(1);
  });
  it('should send number of members on record', async () => {
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacter]);
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('ℹ️ There are currently 1 registered members on record.');
  });
  it('should handle errors with character gathering', async () => {
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockImplementation(() => {throw new Error('Operation went boom');});
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('## ❌ An error occurred while gathering data from the API!');
  });
  it('should error when no characters return from the API', async () => {
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([]);
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('## ❌ No characters were gathered from the API!');
  });
  it('should properly relay errors from the remover or suggestions functions', async () => {
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
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
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacter]);
    service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
    service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
    service.roleInconsistencies = jest.fn().mockResolvedValueOnce([]);

    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('# Starting scan...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# Task: [1/5] Gathering 1 characters from the ALB API...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# Task: [2/5] Checking 1 characters for membership status...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# Task: [3/5] Performing reverse role scan...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# Task: [4/5] Checking for role inconsistencies...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# Task: [5/5] Discord enforcement scan...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## Scan complete!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('------------------------------------------');
    expect(mockDiscordMessage.delete).toBeCalled();

    // Also expect functions to actually be called
    expect(service.gatherCharacters).toBeCalledTimes(1);
    expect(service.removeLeavers).toBeCalledTimes(1);
    expect(service.reverseRoleScan).toBeCalledTimes(1);
    expect(service.roleInconsistencies).toBeCalledTimes(1);
  });

  // Reverse role scanning
  it('reverse scan should properly error upon blank role', async () => {
    mockDiscordMessage.guild.roles.fetch = jest.fn().mockImplementation(() => {
      return null;
    });
    await expect(service.reverseRoleScan(mockDiscordMessage)).rejects.toThrowError('Reverse Role Scan: Role @ALB/US/Guildmaster does not seem to exist!');
  });
  it('reverse scan should properly error upon Discord role error', async () => {
    const errMsg = 'Discord don\'t like you';
    mockDiscordMessage.guild.roles.fetch = jest.fn().mockImplementationOnce(() => {
      throw new Error(errMsg);
    });
    await expect(service.reverseRoleScan(mockDiscordMessage)).rejects.toThrowError(`Reverse Role Scan: Error fetching role @ALB/US/Guildmaster! Err: ${errMsg}`);
  });
  it('reverse scan should properly handle when no members were found for any roles', async () => {
    mockDiscordMessage.guild.roles.fetch = jest.fn().mockImplementation(() => {
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
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([]);

    const mockedRoleToDelete = {
      name: 'ALB/Captain',
      id: mockCaptainRoleId,
      members: [
        [mockDiscordUser.id, mockDiscordUser],
      ],
    };

    // Mock the Discord API to return a list of Discord GuildMembers who have the Captain role
    mockDiscordMessage.guild.roles.fetch = jest.fn()
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
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚨 1 invalid users detected via Reverse Role Scan!\nThese users have been **automatically** stripped of their incorrect roles.');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('foo'); // For invalid user line
    expect(mockDiscordUser.roles.remove).toBeCalledWith(mockedRoleToDelete);
  });
  it('reverse scan should return no change message properly', async () => {
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);

    const mockedRole = {
      name: 'ALB/Captain',
      id: mockCaptainRoleId,
      members: [],
    };

    // Mock the Discord API to return a list of Discord GuildMembers who have the Captain role
    mockDiscordMessage.guild.roles.fetch = jest.fn()
      .mockImplementation(() => mockedRole);

    await service.reverseRoleScan(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('foo'); // For scanCountMessage
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanning 7 Discord roles for members who are falsely registered...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('✅ No invalid users were detected via Reverse Role Scan.');
  });

  // Remove leavers handling
  it('should properly handle guild only leavers who have joined a new guild', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    await service.removeLeavers([mockCharacter], mockDiscordMessage);

    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
    expect(mockDiscordUser.roles.remove).toBeCalled();
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
  });
  it('should NOT take action when guild only leavers have joined a new guild with a dry run', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    await service.removeLeavers([mockCharacter], mockDiscordMessage, true);

    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalledTimes(0);

  });
  it('should properly handle guild only leavers when they have no guild', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = null;

    await service.removeLeavers([mockCharacter], mockDiscordMessage);

    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
    expect(mockDiscordUser.roles.remove).toBeCalled();
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
  });
  it('should properly handle server only leavers', async () => {
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- ‼️🫥️ Discord member for Character **${mockCharacter.Name}** has left the DIG Discord server. Their registration status has been removed. **They require booting from the Guild!**`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
  });
  it('should NOT take action with server only leavers with a dry run', async () => {
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage, true);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- ‼️🫥️ Discord member for Character **${mockCharacter.Name}** has left the DIG Discord server. Their registration status has been removed. **They require booting from the Guild!**`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalledTimes(0);
  });
  it('should properly handle leavers for both server and guild', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 💁 Character / Player ${mockCharacter.Name} has left **both** the DIG server and the Guild. They are dead to us now 💅`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
  });
  it('should NOT take action for leavers for both server and guild with a dry run', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage, true);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 💁 Character / Player ${mockCharacter.Name} has left **both** the DIG server and the Guild. They are dead to us now 💅`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalledTimes(0);
  });
  it('should properly handle guild only leavers and handle role errors', async () => {
    const mockedRole = TestBootstrapper.getMockDiscordRole('lol');
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';
    mockDiscordMessage.guild.roles.cache.get = jest.fn().mockImplementation(() => {
      return {
        ...mockedRole,
        members: {
          has: jest.fn().mockImplementationOnce(() => true),
        },
      };
    });
    mockDiscordUser.roles.remove = jest.fn().mockRejectedValueOnce(new Error('Operation went boom!'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`ERROR: Unable to remove role "${mockedRole.name}" from ${mockCharacter.Name} (${mockCharacter.Id}). Err: "Operation went boom!". Pinging <@${mockDevUserId}>!`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(7);
  });
  it('should properly handle guild leavers and handle database errors', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    mockAlbionRegistrationsRepository.removeAndFlush = jest.fn().mockRejectedValueOnce(new Error('Operation went boom'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(7);

    expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`ERROR: Unable to remove Albion Character "${mockCharacter.Name}" (${mockCharacter.Id}) from registration database! Pinging <@${mockDevUserId}>!`);
  });
  it('should properly handle zero server leavers', async () => {
    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(2);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('✅ No leavers were detected.');
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalledTimes(0);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
  });

  // Inconsistency scanner tests
  const testCases = [
    {
      title: 'Captain needs Initiate removed and missing Squire',
      roles: [mockCaptainRoleId, mockInitiateRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockCaptainRoleId, name: mockCaptainName },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Guild Master having Initiate, Captain and General when they shouldn\'t',
      roles: [mockGuildUSLeaderRoleId, mockInitiateRoleId, mockCaptainRoleId, mockGeneralRoleId, mockSquireRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockGuildUSLeaderRoleId, name: mockGuildUSLeaderRoleName },
      expected: [
        { id: mockGeneralRoleId, name: mockGeneralName, action: 'removed', message: '' },
        { id: mockCaptainRoleId, name: mockCaptainName, action: 'removed', message: '' },
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Guild Master requires Squire',
      roles: [mockGuildUSLeaderRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockGuildUSLeaderRoleId, name: mockGuildUSLeaderRoleName },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Master requires Squire',
      roles: [mockGuildUSOfficerRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockGuildUSOfficerRoleId, name: mockUSOfficerRoleName },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
      ],
    },
    {
      title: 'General requires Squire',
      roles: [mockGeneralRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockGeneralRoleId, name: mockGeneralName },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Captain requires Squire',
      roles: [mockCaptainRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockCaptainRoleId, name: mockCaptainName },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Squire has no extra roles',
      roles: [mockSquireRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockSquireRoleId, name: mockSquireName },
      expected: [],
    },
    {
      title: 'Initiate has no extra roles',
      roles: [mockInitiateRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
      expected: [],
    },
    {
      title: 'Guild Masters should not have Initiate and should have Squire',
      roles: [mockGuildUSLeaderRoleId, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockGuildUSLeaderRoleId, name: mockGuildUSLeaderRoleName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Masters should not have Initiate and should have Squire',
      roles: [mockGuildUSOfficerRoleId, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockGuildUSOfficerRoleId, name: mockUSOfficerRoleName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Generals should not have Initiate and should have Squire',
      roles: [mockGeneralRoleId, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockGeneralRoleId, name: mockGeneralName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Captains should not have Initiate and should have Squire',
      roles: [mockCaptainRoleId, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockCaptainRoleId, name: mockCaptainName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Squires should not have Initiate',
      roles: [mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleId],
      highestPriorityRole: { id: mockSquireRoleId, name: mockSquireName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
    },
    {
      title: 'Squires should have registered role',
      roles: [mockSquireRoleId],
      highestPriorityRole: { id: mockSquireRoleId, name: mockSquireName },
      expected: [
        { id: mockRegisteredRoleId, name: mockRegisteredName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Initiate should have registered role',
      roles: [mockInitiateRoleId],
      highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
      expected: [
        { id: mockRegisteredRoleId, name: mockRegisteredName, action: 'added', message: '' },
      ],
    },
    {
      title: 'Registered people should have at least registered and initiate',
      roles: [],
      highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'added', message: '' },
        { id: mockRegisteredRoleId, name: mockRegisteredName, action: 'added', message: '' },
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
      emoji = '‼️';
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
    mockDiscordUser.id = mockScanUserId;
    setupRoleTestMocks([mockGuildUSLeaderRoleId, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleId]); // Should require they remove initiate rank
    expect((await service.checkRoleInconsistencies(mockDiscordUser)).length).toEqual(0);
  });
  it('roleInconsistencies should still process non excluded users', async () => {
    setupRoleTestMocks([mockGuildUSLeaderRoleId, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleId]); // Should require they remove initiate rank
    expect((await service.checkRoleInconsistencies(mockDiscordUser)).length).toEqual(1);
  });
  it('roleInconsistencies should properly indicate progress when multiple users are involved', async () => {
    mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValueOnce([mockRegisteredMember, mockRegisteredMember, mockRegisteredMember, mockRegisteredMember, mockRegisteredMember]);
    await service.roleInconsistencies(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### Scanning 5 members for role inconsistencies... [0/5]');
    // Tried making it also check the scanCountMessage but that is an absolute brain melter as it's a new instance of the message object...
  });
});
