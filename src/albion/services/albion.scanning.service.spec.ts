/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { DiscordService } from '../../discord/discord.service';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EntityRepository } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { AlbionScanningService } from './albion.scanning.service';
import { AlbionApiService } from './albion.api.service';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { AlbionGuildMembersEntity } from '../../database/entities/albion.guildmembers.entity';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionDiscordEnforcementService } from './albion.discord.enforcement.service';

const mockDevUserId = TestBootstrapper.mockConfig.discord.devUserId;
const mockScanUserId = '1337';

// Role constants
const mockGuildLeaderRoleIdUS = '1158467537550454895';
const mockGuildLeaderRoleIdEU = '45656565697643';
const mockGuildLeaderRoleNameUS = '@ALB/US/Guildmaster';
const mockGuildLeaderRoleNameEU = '@ALB/EU/Archmage';
const mockGuildOfficerRoleIdUS = '1158467574678429696';
const mockGuildOfficerRoleIdEU = '44564564385676';
const mockOfficerRoleNameUS = '@ALB/US/Master';
const mockOfficerRoleNameEU = '@ALB/EU/Magister';
const mockGeneralRoleId = '1158467600687300699';
const mockGeneralName = '@ALB/US/General';
const mockCaptainRoleId = '1158467651165761626';
const mockCaptainName = '@ALB/US/Captain';
const mockAdeptRoleId = '457687980955645345';
const mockAdeptRoleName = '@ALB/EU/Adept';
const mockSquireRoleId = '1158467840496635914';
const mockSquireName = '@ALB/US/Squire';
const mockGraduateRoleId = '4566879809099';
const mockGraduateName = '@ALB/EU/Graduate';
const mockInitiateRoleId = '1139909152701947944';
const mockInitiateName = '@ALB/US/Initiate';
const mockDiscipleRoleId = '4465686797898665';
const mockDiscipleName = '@ALB/EU/Disciple';
const mockRegisteredRoleIdUS = '1155987100928323594';
const mockRegisteredNameUS = '@ALB/US/Registered';
const mockRegisteredRoleIdEU = '446576897089876656';
const mockRegisteredNameEU = '@ALB/EU/Registered';

describe('AlbionScanningService', () => {
  let service: AlbionScanningService;
  let discordEnforcementService: AlbionDiscordEnforcementService;
  let mockDiscordUser: any;
  let mockDiscordMessage: any;
  let mockRegisteredMember: AlbionRegistrationsEntity;
  let mockAlbionGuildMember: AlbionGuildMembersEntity;
  let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;
  let mockAlbionGuildMembersRepository: EntityRepository<AlbionGuildMembersEntity>;
  let mockCharacter: AlbionPlayerInterface;

  beforeEach(async () => {
    mockCharacter = TestBootstrapper.getMockAlbionCharacter(TestBootstrapper.mockConfig.albion.guildIdUS);
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
        AlbionDiscordEnforcementService,
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
    discordEnforcementService = moduleRef.get<AlbionDiscordEnforcementService>(AlbionDiscordEnforcementService);

    const albionMerged = {
      ...TestBootstrapper.mockConfig.albion,
      ...{
        scanExcludedUsers: [mockScanUserId],
        scanPingRoles: [mockGuildLeaderRoleIdUS, mockGuildOfficerRoleIdUS],
        roleMap: [
          {
            name: mockGuildLeaderRoleNameUS,
            discordRoleId: mockGuildLeaderRoleIdUS,
            priority: 1,
            keep: true,
            server: AlbionServer.AMERICAS,
          },
          {
            name: mockGuildLeaderRoleNameEU,
            discordRoleId: mockGuildLeaderRoleIdEU,
            priority: 1,
            keep: true,
            server: AlbionServer.EUROPE,
          },
          {
            name: mockOfficerRoleNameUS,
            discordRoleId: mockGuildOfficerRoleIdUS,
            priority: 2,
            keep: false,
            server: AlbionServer.AMERICAS,
          },
          {
            name: mockOfficerRoleNameEU,
            discordRoleId: mockGuildOfficerRoleIdEU,
            priority: 2,
            keep: false,
            server: AlbionServer.EUROPE,
          },
          {
            name: mockGeneralName,
            discordRoleId: mockGeneralRoleId,
            priority: 3,
            keep: false,
            server: AlbionServer.AMERICAS,
          },
          {
            name: mockCaptainName,
            discordRoleId: mockCaptainRoleId,
            priority: 4,
            keep: false,
            server: AlbionServer.AMERICAS,
          },
          {
            name: mockAdeptRoleName,
            discordRoleId: mockAdeptRoleId,
            priority: 4,
            keep: false,
            server: AlbionServer.EUROPE,
          },
          {
            name: mockSquireName,
            discordRoleId: mockSquireRoleId,
            priority: 5,
            keep: true,
            server: AlbionServer.AMERICAS,
          },
          {
            name: mockGraduateName,
            discordRoleId: mockGraduateRoleId,
            priority: 5,
            keep: true,
            server: AlbionServer.EUROPE,
          },
          {
            name: mockInitiateName,
            discordRoleId: mockInitiateRoleId,
            priority: 6,
            keep: false,
            server: AlbionServer.AMERICAS,
          },
          {
            name: mockDiscipleName,
            discordRoleId: mockDiscipleRoleId,
            priority: 6,
            keep: false,
            server: AlbionServer.EUROPE,
          },
          {
            name: mockRegisteredNameUS,
            discordRoleId: mockRegisteredRoleIdUS,
            priority: 7,
            keep: true,
            server: AlbionServer.AMERICAS,
          },
          {
            name: mockRegisteredNameEU,
            discordRoleId: mockRegisteredRoleIdEU,
            priority: 7,
            keep: true,
            server: AlbionServer.EUROPE,
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
    { id: ' ', name: '@ALB/US/Guildmaster' },
    { id: '1158467574678429696', name: '@ALB/US/Master' },
    { id: '1158467840496635914', name: '@ALB/US/Squire' },
    { id: '1139909152701947944', name: '@ALB/US/Initiate' },
    { id: '1155987100928323594', name: '@ALB/US/Registered' },
    { id: '1232802066414571631', name: '@ALB/EU/Archmage' },
    { id: '1232802105564205126', name: '@ALB/EU/Magister' },
    { id: '1232802165861384305', name: '@ALB/EU/Warcaster' },
    { id: '1232802244219637893', name: '@ALB/EU/Adept' },
    { id: '1232802285734727772', name: '@ALB/EU/Graduate' },
    { id: '1232802355733336196', name: '@ALB/EU/Disciple' },
    { id: '1232778554320879811', name: '@ALB/EU/Registered' },
  ];

  // Execution flow
  it('should send number of members on record', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMember, mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacter, mockCharacter]);
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸ℹ️ There are currently 2 registered members on record.');
  });
  it('should handle errors with character gathering, Americas', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockImplementation(() => {throw new Error('Operation went boom');});
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('## 🇺🇸 ❌ An error occurred while gathering data from the API!');
  });
  it('should error when no characters return from the API', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([]);
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('## 🇺🇸 ❌ No characters were gathered from the API!');
  });
  it('should properly relay errors from role inconsistencies', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacter]);
    service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
    service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
    service.roleInconsistencies = jest.fn().mockImplementation(() => {
      throw new Error('Operation went boom');
    });
    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toHaveBeenLastCalledWith('## 🇺🇸 ❌ An error occurred while scanning!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('Error: Operation went boom');
  });
  it('should properly relay scan progress', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);
    service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacter]);
    service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
    service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
    service.roleInconsistencies = jest.fn().mockResolvedValueOnce([]);

    await service.startScan(mockDiscordMessage);
    expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Starting scan...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [1/5] Gathering 1 characters from the ALB API...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [2/5] Checking 1 characters for membership status...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [3/5] Performing reverse role scan...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [4/5] Checking for role inconsistencies...');
    expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [5/5] Discord enforcement scan...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 Scan complete!');
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
  it('reverse scan should properly handle when no members were found for any usRoles', async () => {
    mockDiscordMessage.guild.roles.fetch = jest.fn().mockImplementation(() => {
      return {
        members: [],
      };
    });
    await service.reverseRoleScan(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith('🇺🇸 ✅ No invalid users were detected via Reverse Role Scan.');
  });
  // Happy path
  it('reverse scan should properly detect an unregistered member who has a role they shouldn\'t', async () => {
    // Force the AlbionsMembersEntity to be empty
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([]);

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
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanning 7 Discord roles for members who are falsely registered...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚨 1 invalid users detected via Reverse Role Scan!\nThese users have been **automatically** stripped of their incorrect roles.');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('foo'); // For invalid user line
    expect(mockDiscordUser.roles.remove).toBeCalledWith(mockedRoleToDelete);
  });
  it('reverse scan should return no change message properly', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMember]);

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
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanning 7 Discord roles for members who are falsely registered...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸 ✅ No invalid users were detected via Reverse Role Scan.');
  });

  // Remove leavers handling
  it('should properly handle guild only leavers who have joined a new guild', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    await service.removeLeavers([mockCharacter], mockDiscordMessage);

    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
    expect(mockDiscordUser.roles.remove).toBeCalled();
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
  });
  it('should NOT take action when guild only leavers have joined a new guild with a dry run', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';

    await service.removeLeavers([mockCharacter], mockDiscordMessage, true);

    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalledTimes(0);

  });
  it('should properly handle guild only leavers when they have no guild', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = null;

    await service.removeLeavers([mockCharacter], mockDiscordMessage);

    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
    expect(mockDiscordUser.roles.remove).toBeCalled();
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
  });
  it('should properly handle server only leavers', async () => {
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 ‼️🫥️ Discord member for Character **${mockCharacter.Name}** has left the DIG Discord server. Their registration status has been removed. **They require booting from the Guild!**`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
  });
  it('should NOT take action with server only leavers with a dry run', async () => {
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage, true);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 ‼️🫥️ Discord member for Character **${mockCharacter.Name}** has left the DIG Discord server. Their registration status has been removed. **They require booting from the Guild!**`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalledTimes(0);
  });
  it('should properly handle leavers for both server and guild', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 💁 Character / Player ${mockCharacter.Name} has left **both** the DIG server and the Guild. They are dead to us now 💅`);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalled();
  });
  it('should NOT take action for leavers for both server and guild with a dry run', async () => {
    // Mock the Albion API response to denote the character has left the guild
    mockCharacter.GuildId = 'foobar';
    mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

    await service.removeLeavers([mockCharacter], mockDiscordMessage, true);
    expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 💁 Character / Player ${mockCharacter.Name} has left **both** the DIG server and the Guild. They are dead to us now 💅`);
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
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 👋 <@${mockDiscordUser.id}>'s character **${mockCharacter.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
    expect(mockDiscordMessage.channel.send).toBeCalledWith(`🇺🇸 ERROR: Unable to remove role "${mockedRole.name}" from ${mockCharacter.Name} (${mockCharacter.Id}). Err: "Operation went boom!". Pinging <@${mockDevUserId}>!`);
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
    expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
    expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸 ✅ No leavers were detected.');
    expect(mockAlbionRegistrationsRepository.removeAndFlush).toBeCalledTimes(0);
    expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
  });

  // Inconsistency scanner tests
  const testCases = [
    {
      title: 'Captain needs Initiate removed and missing Squire',
      roles: [mockCaptainRoleId, mockInitiateRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockCaptainRoleId, name: mockCaptainName },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Guild Master having Initiate, Captain and General when they shouldn\'t',
      roles: [mockGuildLeaderRoleIdUS, mockInitiateRoleId, mockCaptainRoleId, mockGeneralRoleId, mockSquireRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockGuildLeaderRoleIdUS, name: mockGuildLeaderRoleNameUS },
      expected: [
        { id: mockGeneralRoleId, name: mockGeneralName, action: 'removed', message: '' },
        { id: mockCaptainRoleId, name: mockCaptainName, action: 'removed', message: '' },
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Guild Master requires Squire',
      roles: [mockGuildLeaderRoleIdUS, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockGuildLeaderRoleIdUS, name: mockGuildLeaderRoleNameUS },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Archmage requires Graduate',
      roles: [mockGuildLeaderRoleIdEU, mockRegisteredRoleIdEU],
      highestPriorityRole: { id: mockGuildLeaderRoleIdEU, name: mockGuildLeaderRoleNameEU },
      expected: [
        { id: mockGraduateRoleId, name: mockGraduateName, action: 'added', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Master requires Squire',
      roles: [mockGuildOfficerRoleIdUS, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockGuildOfficerRoleIdUS, name: mockOfficerRoleNameUS },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Magister requires Squire',
      roles: [mockGuildOfficerRoleIdEU, mockRegisteredRoleIdEU],
      highestPriorityRole: { id: mockGuildOfficerRoleIdEU, name: mockOfficerRoleNameEU },
      expected: [
        { id: mockGraduateRoleId, name: mockGraduateName, action: 'added', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'General requires Squire',
      roles: [mockGeneralRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockGeneralRoleId, name: mockGeneralName },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Captain requires Squire',
      roles: [mockCaptainRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockCaptainRoleId, name: mockCaptainName },
      expected: [
        { id: mockSquireRoleId, name: mockSquireName, action: 'added', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Adept requires Graduate',
      roles: [mockAdeptRoleId, mockRegisteredRoleIdEU],
      highestPriorityRole: { id: mockAdeptRoleId, name: mockAdeptRoleName },
      expected: [
        { id: mockGraduateRoleId, name: mockGraduateName, action: 'added', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Squire has no extra roles',
      roles: [mockSquireRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockSquireRoleId, name: mockSquireName },
      expected: [],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Graduate has no extra roles',
      roles: [mockGraduateRoleId, mockRegisteredRoleIdEU],
      highestPriorityRole: { id: mockGraduateRoleId, name: mockGraduateName },
      expected: [],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Initiate has no extra roles',
      roles: [mockInitiateRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
      expected: [],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Disciples has no extra roles',
      roles: [mockDiscipleRoleId, mockRegisteredRoleIdEU],
      highestPriorityRole: { id: mockDiscipleRoleId, name: mockDiscipleName },
      expected: [],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Guild Masters should not have Initiate and should have Squire',
      roles: [mockGuildLeaderRoleIdUS, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockGuildLeaderRoleIdUS, name: mockGuildLeaderRoleNameUS },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Masters should not have Initiate and should have Squire',
      roles: [mockGuildOfficerRoleIdUS, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockGuildOfficerRoleIdUS, name: mockOfficerRoleNameUS },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Generals should not have Initiate and should have Squire',
      roles: [mockGeneralRoleId, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockGeneralRoleId, name: mockGeneralName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Captains should not have Initiate and should have Squire',
      roles: [mockCaptainRoleId, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockCaptainRoleId, name: mockCaptainName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Adepts should not have Disciple and should have Graduate',
      roles: [mockAdeptRoleId, mockGraduateRoleId, mockDiscipleRoleId, mockRegisteredRoleIdEU],
      highestPriorityRole: { id: mockAdeptRoleId, name: mockAdeptRoleName },
      expected: [
        { id: mockDiscipleRoleId, name: mockDiscipleName, action: 'removed', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Adepts should have graduate if missing',
      roles: [mockAdeptRoleId, mockRegisteredRoleIdEU],
      highestPriorityRole: { id: mockAdeptRoleId, name: mockAdeptRoleName },
      expected: [
        { id: mockGraduateRoleId, name: mockGraduateName, action: 'added', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Squires should not have Initiate',
      roles: [mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleIdUS],
      highestPriorityRole: { id: mockSquireRoleId, name: mockSquireName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'removed', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Squires should have registered role',
      roles: [mockSquireRoleId],
      highestPriorityRole: { id: mockSquireRoleId, name: mockSquireName },
      expected: [
        { id: mockRegisteredRoleIdUS, name: mockRegisteredNameUS, action: 'added', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Graduates should have registered role',
      roles: [mockGraduateRoleId],
      highestPriorityRole: { id: mockGraduateRoleId, name: mockGraduateName },
      expected: [
        { id: mockRegisteredRoleIdEU, name: mockRegisteredNameEU, action: 'added', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Graduates should not have roles of lower priority',
      roles: [mockRegisteredRoleIdEU, mockGraduateRoleId, mockDiscipleRoleId],
      highestPriorityRole: { id: mockGraduateRoleId, name: mockGraduateName },
      expected: [
        { id: mockDiscipleRoleId, name: mockDiscipleName, action: 'removed', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Initiate should always have ALB/US/Registered role',
      roles: [mockInitiateRoleId],
      highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
      expected: [
        { id: mockRegisteredRoleIdUS, name: mockRegisteredNameUS, action: 'added', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'Disciples should always have ALB/EU/Registered role',
      roles: [mockDiscipleRoleId],
      highestPriorityRole: { id: mockDiscipleRoleId, name: mockDiscipleName },
      expected: [
        { id: mockRegisteredRoleIdEU, name: mockRegisteredNameEU, action: 'added', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Registered members should at least have the entry level role',
      roles: [mockRegisteredRoleIdEU],
      highestPriorityRole: { id: mockRegisteredRoleIdEU, name: mockRegisteredNameEU },
      expected: [
        { id: mockDiscipleRoleId, name: mockDiscipleName, action: 'missingEntryRole', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'US Registered members should have at least ALB/US/Registered and Initiate',
      roles: [],
      highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
      expected: [
        { id: mockInitiateRoleId, name: mockInitiateName, action: 'added', message: '' },
        { id: mockRegisteredRoleIdUS, name: mockRegisteredNameUS, action: 'added', message: '' },
      ],
      server: AlbionServer.AMERICAS,
    },
    {
      title: 'EU Registered members should have at least ALB/EU/Registered and Disciple',
      roles: [],
      highestPriorityRole: { id: mockDiscipleRoleId, name: mockDiscipleName },
      expected: [
        { id: mockDiscipleRoleId, name: mockDiscipleName, action: 'added', message: '' },
        { id: mockRegisteredRoleIdEU, name: mockRegisteredNameEU, action: 'added', message: '' },
      ],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Dual registrants who have correct roles are not changed upon being scanned based on EU server context',
      roles: [mockRegisteredRoleIdUS, mockRegisteredRoleIdEU, mockDiscipleRoleId, mockInitiateRoleId],
      highestPriorityRole: { id: mockDiscipleRoleId, name: mockDiscipleName },
      expected: [],
      server: AlbionServer.EUROPE,
    },
    {
      title: 'Dual registrants who have correct roles are not changed upon being scanned based on US server context',
      roles: [mockRegisteredRoleIdUS, mockRegisteredRoleIdEU, mockDiscipleRoleId, mockInitiateRoleId],
      highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
      expected: [],
      server: AlbionServer.AMERICAS,
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
    const serverEmoji = testCase.server === AlbionServer.AMERICAS ? '🇺🇸' : '🇪🇺';
    let emoji = `${serverEmoji} ➕`;
    let reason = `their highest role is **${testCase.highestPriorityRole.name}**, and the role is marked as "keep".`;

    if (expected.action === 'removed') {
      emoji = `${serverEmoji} ➖`;
      reason = `their highest role is **${testCase.highestPriorityRole.name}**, and the role is not marked as "keep".`;
    }

    if (expected.action === 'missingEntryRole') {
      emoji = `${serverEmoji} ‼️`;
      reason = 'they are registered but don\'t have at least the entry level role!';
    }

    if (testCase.roles.length === 0) {
      emoji = `${serverEmoji} ‼️`;
      reason = 'they have no roles but are registered!';
    }

    let actionResult = expected.action;
    if (expected.action === 'missingEntryRole') {
      actionResult = 'added';
    }

    return `- ${emoji} <@${mockDiscordUser.id}> requires role **${expected.name}** to be ${actionResult} because ${reason}`;
  };

  testCases.forEach(testCase => {
    it(`roleInconsistencies detects ${testCase.title}`, async () => {
      const emoji = testCase.server === AlbionServer.AMERICAS ? '🇺🇸' : '🇪🇺';
      // Take the test case and fill in the expected messages, as it would be a PITA to define them at the array level
      testCase.expected.forEach((expected, i) => {
        testCase.expected[i].message = generateMessage(testCase, expected);
      });

      setupRoleTestMocks(testCase.roles);
      const result = await service.checkRoleInconsistencies(mockDiscordUser, testCase.server);

      expect(result.length).toEqual(testCase.expected.length);

      result.forEach((r, i) => {
        let actionResult = testCase.expected[i].action;
        if (testCase.expected[i].action === 'missingEntryRole') {
          actionResult = 'added';
        }
        expect(r.id).toEqual(testCase.expected[i].id);
        expect(r.name).toEqual(testCase.expected[i].name);
        expect(r.action).toEqual(actionResult);
        expect(r.message).toEqual(testCase.expected[i].message);
      });

      // Run it again except checking the messages it sends back
      await service.roleInconsistencies(mockDiscordMessage, false, testCase.server);

      if (testCase.expected.length === 0) {
        expect(mockDiscordMessage.channel.send).toBeCalledWith(`${emoji} ✅ No role inconsistencies were detected.`);
        return;
      }

      expect(mockDiscordMessage.channel.send).toBeCalledWith(`## ${emoji} 👀 ${testCase.expected.length} role inconsistencies detected!`);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('---');
    });
  });
  it('roleInconsistencies should ensure certain members are excluded from scanning', async () => {
    mockDiscordUser.id = mockScanUserId;
    setupRoleTestMocks([mockGuildLeaderRoleIdUS, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleIdUS]); // Should require they remove initiate rank
    expect((await service.checkRoleInconsistencies(mockDiscordUser)).length).toEqual(0);
  });
  it('roleInconsistencies should still process non excluded users', async () => {
    setupRoleTestMocks([mockGuildLeaderRoleIdUS, mockSquireRoleId, mockInitiateRoleId, mockRegisteredRoleIdUS]); // Should require they remove initiate rank
    expect((await service.checkRoleInconsistencies(mockDiscordUser)).length).toEqual(1);
  });
  it('roleInconsistencies should properly indicate progress when multiple users are involved', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMember, mockRegisteredMember, mockRegisteredMember, mockRegisteredMember, mockRegisteredMember]);
    await service.roleInconsistencies(mockDiscordMessage);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 Scanning 5 members for role inconsistencies... [0/5]');
  });
  it('roleInconsistencies should properly indicate progress when multiple users are involved for EU', async () => {
    mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMember, mockRegisteredMember, mockRegisteredMember, mockRegisteredMember, mockRegisteredMember]);
    await service.roleInconsistencies(mockDiscordMessage, true, AlbionServer.EUROPE);
    expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 Scanning 5 members for role inconsistencies... [0/5]');
  });
});
