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
const mockGuildLeaderRoleId = '45656565697643';
const mockGuildLeaderRoleNameUS = '@ALB/US/Guildmaster';
const mockGuildLeaderRoleName = '@ALB/Archmage';
const mockGuildOfficerRoleIdUS = '1158467574678429696';
const mockGuildOfficerRoleId = '44564564385676';
const mockOfficerRoleNameUS = '@ALB/US/Master';
const mockOfficerRoleName = '@ALB/Magister';
const mockGeneralRoleId = '1158467600687300699';
const mockGeneralName = '@ALB/US/General';
const mockCaptainRoleId = '1158467651165761626';
const mockCaptainName = '@ALB/US/Captain';
const mockAdeptRoleId = '457687980955645345';
const mockAdeptRoleName = '@ALB/Adept';
const mockSquireRoleId = '1158467840496635914';
const mockSquireName = '@ALB/US/Squire';
const mockGraduateRoleId = '4566879809099';
const mockGraduateName = '@ALB/Graduate';
const mockInitiateRoleId = '1139909152701947944';
const mockInitiateName = '@ALB/US/Initiate';
const mockDiscipleRoleId = '4465686797898665';
const mockDiscipleName = '@ALB/Disciple';
const mockRegisteredRoleIdUS = '1155987100928323594';
const mockRegisteredNameUS = '@ALB/US/Registered';
const mockRegisteredRoleId = '446576897089876656';
const mockRegisteredNameEU = '@ALB/Registered';

describe('AlbionScanningService', () => {
  let service: AlbionScanningService;
  // let discordEnforcementService: AlbionDiscordEnforcementService;
  let albionApiService: AlbionApiService;
  let mockDiscordUser: any;
  let mockDiscordMessage: any;
  let mockAlbionGuildMember: AlbionGuildMembersEntity;
  let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;
  let mockAlbionGuildMembersRepository: EntityRepository<AlbionGuildMembersEntity>;
  let mockCharacterUS: AlbionPlayerInterface;
  let mockCharacterEU: AlbionPlayerInterface;
  let mockRegisteredMemberUS: AlbionRegistrationsEntity;
  let mockRegisteredMemberEU: AlbionRegistrationsEntity;

  beforeEach(async () => {
    mockCharacterUS = TestBootstrapper.getMockAlbionCharacter(TestBootstrapper, AlbionServer.AMERICAS);
    mockCharacterEU = TestBootstrapper.getMockAlbionCharacter(TestBootstrapper, AlbionServer.EUROPE);
    mockRegisteredMemberUS = {
      id: 123456789,
      discordId: '123456789',
      characterId: mockCharacterUS.Id,
      characterName: mockCharacterUS.Name,
      guildId: mockCharacterUS.GuildId,
      manual: false,
      manualCreatedByDiscordId: null,
      manualCreatedByDiscordName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AlbionRegistrationsEntity;
    mockRegisteredMemberEU = {
      id: 123456789,
      discordId: '123456789',
      characterId: mockCharacterEU.Id,
      characterName: mockCharacterEU.Name,
      guildId: mockCharacterEU.GuildId,
      manual: false,
      manualCreatedByDiscordId: null,
      manualCreatedByDiscordName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AlbionRegistrationsEntity;
    mockAlbionGuildMember = {
      id: 123456789,
      characterId: mockCharacterUS.Id,
      characterName: mockCharacterUS.Name,
      registered: false,
      warned: false,
    } as AlbionGuildMembersEntity;

    mockAlbionRegistrationsRepository = TestBootstrapper.getMockRepositoryInjected(mockRegisteredMemberUS);
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
            getTextChannel: jest.fn(),
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
    // discordEnforcementService = moduleRef.get<AlbionDiscordEnforcementService>(AlbionDiscordEnforcementService);
    albionApiService = moduleRef.get<AlbionApiService>(AlbionApiService);

    const albionMerged = {
      ...TestBootstrapper.mockConfig.albion,
      ...{
        scanExcludedUsers: [mockScanUserId],
        pingLeaderRolesUS: [mockGuildLeaderRoleIdUS, mockGuildOfficerRoleIdUS],
        pingLeaderRoles: [mockGuildLeaderRoleId, mockGuildOfficerRoleId],
        roleMap: [
          {
            name: mockGuildLeaderRoleNameUS,
            discordRoleId: mockGuildLeaderRoleIdUS,
            priority: 1,
            keep: true,
            server: AlbionServer.AMERICAS,
          },
          {
            name: mockGuildLeaderRoleName,
            discordRoleId: mockGuildLeaderRoleId,
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
            name: mockOfficerRoleName,
            discordRoleId: mockGuildOfficerRoleId,
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
            discordRoleId: mockRegisteredRoleId,
            priority: 7,
            keep: true,
            server: AlbionServer.EUROPE,
          },
        ],
      },
    };
    const fullData = {
      ...TestBootstrapper.mockConfig,
      albion: albionMerged,
    };

    TestBootstrapper.setupConfig(moduleRef, fullData);
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
    { id: '1232802066414571631', name: '@ALB/Archmage' },
    { id: '1232802105564205126', name: '@ALB/Magister' },
    { id: '1232802165861384305', name: '@ALB/Warcaster' },
    { id: '1232802244219637893', name: '@ALB/Adept' },
    { id: '1232802285734727772', name: '@ALB/Graduate' },
    { id: '1232802355733336196', name: '@ALB/Disciple' },
    { id: '1232778554320879811', name: '@ALB/Registered' },
  ];

  describe('Scanning workflow', () => {
    // Execution flow
    it('should send number of members on record', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS, mockRegisteredMemberUS]);
      service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacterUS, mockCharacterUS]);
      await service.startScan(mockDiscordMessage);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸 ℹ️ There are currently 2 registered members on record.');
    });
    it('should handle errors with character gathering, Americas', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS]);
      service.gatherCharacters = jest.fn().mockImplementation(() => {throw new Error('Operation went boom');});
      await service.startScan(mockDiscordMessage);
      expect(mockDiscordMessage.edit).toBeCalledWith('## 🇺🇸 ❌ An error occurred while gathering data from the API!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('Error: Operation went boom');
    });
    it('should error when no characters return from the API', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS]);
      service.gatherCharacters = jest.fn().mockResolvedValueOnce([]);

      await service.startScan(mockDiscordMessage, false, AlbionServer.AMERICAS);

      expect(mockDiscordMessage.edit).toBeCalledWith('## 🇺🇸 ❌ No characters were gathered from the API!');
    });
    it('should properly relay errors from role inconsistencies', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS]);
      service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacterUS]);
      service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
      service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
      service.roleInconsistencies = jest.fn().mockImplementation(() => {
        throw new Error('Operation went boom');
      });

      await service.startScan(mockDiscordMessage, false, AlbionServer.AMERICAS);

      expect(mockDiscordMessage.edit).toHaveBeenLastCalledWith('## 🇺🇸 ❌ An error occurred while scanning!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('Error: Operation went boom');
    });
    it('should properly communicate scan progress', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS]);
      service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacterUS]);
      service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
      service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
      service.roleInconsistencies = jest.fn().mockResolvedValueOnce([]);

      await service.startScan(mockDiscordMessage, false, AlbionServer.AMERICAS);
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Starting scan...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [1/5] Gathering 1 characters from the ALB API...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [2/5] Checking 1 characters for membership status...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [3/5] Performing reverse role scan...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [4/5] Checking for role inconsistencies...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇺🇸 Task: [5/5] Discord enforcement scan...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 Scan complete!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('------------------------------------------');
      expect(mockDiscordMessage.delete).toBeCalled();
    });
    it('should properly communicate scan progress, EU', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberEU]);
      service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacterEU]);
      service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
      service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
      service.roleInconsistencies = jest.fn().mockResolvedValueOnce([]);

      await service.startScan(mockDiscordMessage, false, AlbionServer.EUROPE);
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇪🇺 Starting scan...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇪🇺 Task: [1/5] Gathering 1 characters from the ALB API...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇪🇺 Task: [2/5] Checking 1 characters for membership status...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇪🇺 Task: [3/5] Performing reverse role scan...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇪🇺 Task: [4/5] Checking for role inconsistencies...');
      expect(mockDiscordMessage.edit).toBeCalledWith('# 🇪🇺 Task: [5/5] Discord enforcement scan...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 Scan complete!');
      expect(mockDiscordMessage.delete).toBeCalled();
    });
    it('should properly call all functions', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS]);
      service.gatherCharacters = jest.fn().mockResolvedValueOnce([mockCharacterUS]);
      service.removeLeavers = jest.fn().mockResolvedValueOnce([]);
      service.reverseRoleScan = jest.fn().mockResolvedValueOnce([]);
      service.roleInconsistencies = jest.fn().mockResolvedValueOnce([]);

      await service.startScan(mockDiscordMessage, false, AlbionServer.AMERICAS);

      // Also expect functions to actually be called
      expect(service.gatherCharacters).toBeCalledTimes(1);
      expect(service.removeLeavers).toBeCalledTimes(1);
      expect(service.reverseRoleScan).toBeCalledTimes(1);
      expect(service.roleInconsistencies).toBeCalledTimes(1);
    });

    it('should properly ping the correct leaders when action is required', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn()
        .mockResolvedValueOnce([mockRegisteredMemberUS])
        .mockResolvedValueOnce([mockRegisteredMemberEU]);
      service.gatherCharacters = jest.fn()
        .mockResolvedValue([mockCharacterUS])
        .mockResolvedValue([mockCharacterEU]);
      service.removeLeavers = jest.fn().mockResolvedValue(true);
      service.reverseRoleScan = jest.fn().mockResolvedValue([]);
      service.roleInconsistencies = jest.fn().mockResolvedValue([]);

      const longText = 'Please review the above actions marked with (‼️) and make any necessary changes manually. To scan again without pinging, run the `/albion-scan` command with the `dry-run` flag set to `true`.';

      await service.startScan(mockDiscordMessage, false, AlbionServer.AMERICAS);
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`🔔 <@&${mockGuildLeaderRoleIdUS}>, <@&${mockGuildOfficerRoleIdUS}> ${longText}`);

      await service.startScan(mockDiscordMessage, false, AlbionServer.EUROPE);
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`🔔 <@&${mockGuildLeaderRoleId}>, <@&${mockGuildOfficerRoleId}> ${longText}`);
    });
  });

  describe('Gather characters', () => {
    it('should properly gather characters from the API', async () => {
      albionApiService.getCharacterById = jest.fn().mockResolvedValueOnce(mockCharacterUS);
      const result = await service.gatherCharacters(
        [mockRegisteredMemberUS],
        mockDiscordMessage,
        0,
        AlbionServer.AMERICAS,
      );
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸 Gathering 1 characters from the Americas ALB API... (attempt #1)');
      expect(result).toEqual([mockCharacterUS]);
    });
    it('should properly gather characters from the EU API', async () => {
      albionApiService.getCharacterById = jest.fn().mockResolvedValueOnce(mockCharacterEU);
      const result = await service.gatherCharacters(
        [mockRegisteredMemberUS],
        mockDiscordMessage,
        0,
        AlbionServer.EUROPE,
      );
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇪🇺 Gathering 1 characters from the Europe ALB API... (attempt #1)');
      expect(result).toEqual([mockCharacterEU]);
    });
    it('should properly denote number of tries', async () => {
      albionApiService.getCharacterById = jest.fn().mockResolvedValueOnce(mockCharacterEU);
      await service.gatherCharacters(
        [mockRegisteredMemberUS],
        mockDiscordMessage,
        1,
        AlbionServer.EUROPE,
      );
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇪🇺 Gathering 1 characters from the Europe ALB API... (attempt #2)');
    });
    it('should fail on the tries exhaustion', async () => {
      albionApiService.getCharacterById = jest.fn().mockResolvedValueOnce(mockCharacterEU);
      const result = await service.gatherCharacters(
        [mockRegisteredMemberUS],
        mockDiscordMessage,
        3,
        AlbionServer.EUROPE,
      );
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`## ❌ An error occurred while gathering data for 1 characters! Giving up after 3 tries! Pinging <@${mockDevUserId}>!`);
      expect(result).toEqual(null);
    });
    it('should retry in 10s if the API call failed, properly denoting progress', async () => {
      jest.spyOn(global, 'setTimeout');
      albionApiService.getCharacterById = jest.fn()
        .mockRejectedValueOnce(new Error('Operation went boom'))
        .mockResolvedValueOnce(mockCharacterUS);
      await service.gatherCharacters(
        [mockRegisteredMemberUS],
        mockDiscordMessage,
        0,
        AlbionServer.AMERICAS,
      );
      expect(setTimeout).toHaveBeenCalledTimes(1);
      expect(setTimeout).toHaveBeenLastCalledWith(expect.any(Function), 10000);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## ⚠️ Couldn\'t gather characters from Americas ALB API.\nError: "Operation went boom".\nRetrying in 10s...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸 Gathering 1 characters from the Americas ALB API... (attempt #2)');
    }, 15000);
  });

  describe('Leavers scanning', () => {
    it('should properly handle guild only leavers who have joined a new guild, US', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterUS.GuildId = 'foobar';

      await service.removeLeavers(
        [mockCharacterUS],
        mockDiscordMessage,
        false,
        AlbionServer.AMERICAS
      );

      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 👋 <@${mockDiscordUser.id}>'s character **${mockCharacterUS.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
      expect(mockDiscordUser.roles.remove).toBeCalled();
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
    });

    it('should properly handle guild only leavers who have joined a new guild, EU', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterEU.GuildId = 'foobar';

      await service.removeLeavers(
        [mockCharacterEU],
        mockDiscordMessage,
        false,
        AlbionServer.EUROPE
      );

      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇪🇺 👋 <@${mockDiscordUser.id}>'s character **${mockCharacterEU.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
      expect(mockDiscordUser.roles.remove).toBeCalled();
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
    });

    it('should NOT take action when guild only leavers have joined a new guild with a dry run', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterUS.GuildId = 'foobar';

      await service.removeLeavers([mockCharacterUS], mockDiscordMessage, true);

      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 👋 <@${mockDiscordUser.id}>'s character **${mockCharacterUS.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalledTimes(0);
    });

    it('should properly handle guild only leavers when they have no guild', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterUS.GuildId = null;

      await service.removeLeavers([mockCharacterUS], mockDiscordMessage);

      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 👋 <@${mockDiscordUser.id}>'s character **${mockCharacterUS.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
      expect(mockDiscordUser.roles.remove).toBeCalled();
      expect(
        mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
    });

    it('should properly handle server only leavers, US', async () => {
      mockCharacterUS.GuildId = TestBootstrapper.mockConfig.albion.guildIdUS;
      mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

      await service.removeLeavers(
        [mockCharacterUS],
        mockDiscordMessage,
        false,
        AlbionServer.AMERICAS
      );
      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 ‼️🫥️ Discord member for Character **${mockCharacterUS.Name}** has left the DIG Discord server. Their registration status has been removed. **They require booting from the Guild!**`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
    });

    it('should properly handle server only leavers, EU', async () => {
      mockCharacterEU.GuildId = TestBootstrapper.mockConfig.albion.guildId;
      mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

      await service.removeLeavers(
        [mockCharacterEU],
        mockDiscordMessage,
        false,
        AlbionServer.EUROPE
      );
      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇪🇺 ‼️🫥️ Discord member for Character **${mockCharacterEU.Name}** has left the DIG Discord server. Their registration status has been removed. **They require booting from the Guild!**`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
    });

    it('should NOT take action with server only leavers with a dry run', async () => {
      mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

      await service.removeLeavers([mockCharacterUS], mockDiscordMessage, true);
      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 ‼️🫥️ Discord member for Character **${mockCharacterUS.Name}** has left the DIG Discord server. Their registration status has been removed. **They require booting from the Guild!**`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalledTimes(0);
    });

    it('should properly handle leavers for both server and guild, US', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterUS.GuildId = 'foobar';
      mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

      await service.removeLeavers(
        [mockCharacterUS],
        mockDiscordMessage,
        false,
        AlbionServer.AMERICAS
      );
      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 💁 Character / Player ${mockCharacterUS.Name} has left **both** the DIG server and the Guild. They are dead to us now 💅`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
    });

    it('should properly handle leavers for both server and guild, EU', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterEU.GuildId = 'foobar';
      mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

      await service.removeLeavers(
        [mockCharacterEU],
        mockDiscordMessage,
        false,
        AlbionServer.EUROPE
      );
      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇪🇺 💁 Character / Player ${mockCharacterEU.Name} has left **both** the DIG server and the Guild. They are dead to us now 💅`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
    });

    it('should NOT take action for leavers for both server and guild with a dry run', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterUS.GuildId = 'foobar';
      mockDiscordMessage.guild.members.fetch = jest.fn().mockRejectedValueOnce(new Error('Unknown Member'));

      await service.removeLeavers(
        [mockCharacterUS],
        mockDiscordMessage,
        true, // Dry run flagged here
        AlbionServer.AMERICAS
      );
      expect(mockDiscordMessage.channel.send).toBeCalledTimes(3);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 💁 Character / Player ${mockCharacterUS.Name} has left **both** the DIG server and the Guild. They are dead to us now 💅`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalledTimes(0);
    });

    it('should properly handle guild only leavers and handle role errors, US', async () => {
      const mockedRole = TestBootstrapper.getMockDiscordRole('lol');
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterUS.GuildId = 'foobar';
      mockDiscordMessage.guild.roles.cache.get = jest.fn().mockImplementation(() => {
        return {
          ...mockedRole,
          members: {
            // eslint-disable-next-line max-nested-callbacks
            has: jest.fn().mockImplementationOnce(() => true),
          },
        };
      });
      mockDiscordUser.roles.remove = jest.fn().mockRejectedValueOnce(new Error('Operation went boom!'));

      await service.removeLeavers(
        [mockCharacterUS],
        mockDiscordMessage,
        false,
        AlbionServer.AMERICAS
      );
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇺🇸 👋 <@${mockDiscordUser.id}>'s character **${mockCharacterUS.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`ERROR: Unable to remove role "${mockedRole.name}" from ${mockCharacterUS.Name} (${mockCharacterUS.Id}). Err: "Operation went boom!". Pinging <@${mockDevUserId}>!`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(7);
    });
    it('should properly handle guild only leavers and handle role errors, EU', async () => {
      const mockedRole = TestBootstrapper.getMockDiscordRole('lol');
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterEU.GuildId = 'foobar';
      mockDiscordMessage.guild.roles.cache.get = jest.fn().mockImplementation(() => {
        return {
          ...mockedRole,
          members: {
            // eslint-disable-next-line max-nested-callbacks
            has: jest.fn().mockImplementationOnce(() => true),
          },
        };
      });
      mockDiscordUser.roles.remove = jest.fn().mockRejectedValueOnce(new Error('Operation went boom boom!'));

      await service.removeLeavers(
        [mockCharacterEU],
        mockDiscordMessage,
        false,
        AlbionServer.EUROPE
      );
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 🚪 1 leavers detected!');
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`- 🇪🇺 👋 <@${mockDiscordUser.id}>'s character **${mockCharacterEU.Name}** has left the Guild but remains on the Discord server. Their roles and registration status have been stripped.`);
      expect(mockDiscordMessage.channel.send).toBeCalledWith(`ERROR: Unable to remove role "${mockedRole.name}" from ${mockCharacterEU.Name} (${mockCharacterEU.Id}). Err: "Operation went boom boom!". Pinging <@${mockDevUserId}>!`);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(6);
    });
    it('should properly handle guild leavers and handle database errors, US', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterUS.GuildId = 'foobar';

      mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush = jest.fn().mockRejectedValueOnce(new Error('Operation went boom'));

      await service.removeLeavers(
        [mockCharacterUS],
        mockDiscordMessage,
        false,
        AlbionServer.AMERICAS
      );
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(7);

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`ERROR: Unable to remove Albion Character "${mockCharacterUS.Name}" (${mockCharacterUS.Id}) from registration database!\nError: "Operation went boom".\nPinging <@${mockDevUserId}>!`);
    });
    it('should properly handle guild leavers and handle database errors, EU', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterEU.GuildId = 'foobar';

      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberEU]);

      mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush = jest.fn().mockRejectedValueOnce(new Error('Operation went boom'));

      await service.removeLeavers(
        [mockCharacterEU],
        mockDiscordMessage,
        false,
        AlbionServer.EUROPE
      );
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalled();
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(6);

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`ERROR: Unable to remove Albion Character "${mockCharacterEU.Name}" (${mockCharacterEU.Id}) from registration database!\nError: "Operation went boom".\nPinging <@${mockDevUserId}>!`);
    });
    it('should properly call the correct member to delete from the database', async () => {
      // Mock the Albion API response to denote the character has left the guild
      mockCharacterEU.GuildId = 'foobar';

      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberEU]);

      await service.removeLeavers(
        [mockCharacterEU],
        mockDiscordMessage,
        false,
        AlbionServer.EUROPE
      );
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalledWith(mockRegisteredMemberEU);
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalledTimes(1);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(6);
    });
    it('should properly handle zero guild or server leavers, US', async () => {
      mockCharacterUS.GuildId = TestBootstrapper.mockConfig.albion.guildIdUS;
      await service.removeLeavers(
        [mockCharacterUS],
        mockDiscordMessage,
        false,
        AlbionServer.AMERICAS
      );
      expect(mockDiscordMessage.channel.send).toBeCalledTimes(2);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸 ✅ No leavers were detected.');
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalledTimes(0);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    });
    it('should properly handle zero guild or server leavers, EU', async () => {
      mockCharacterUS.GuildId = TestBootstrapper.mockConfig.albion.guildId;
      await service.removeLeavers(
        [mockCharacterUS],
        mockDiscordMessage,
        false,
        AlbionServer.EUROPE
      );
      expect(mockDiscordMessage.channel.send).toBeCalledTimes(2);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanned 0/1 registered members...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇪🇺 ✅ No leavers were detected.');
      expect(mockAlbionRegistrationsRepository.getEntityManager().removeAndFlush).toBeCalledTimes(0);
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    });
    it('should properly correctly update the message every 5 members', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValue(new Array(6).fill(mockRegisteredMemberUS),);
      mockCharacterUS.GuildId = TestBootstrapper.mockConfig.albion.guildIdUS;
      await service.removeLeavers(
        new Array(6).fill(mockCharacterUS),
        mockDiscordMessage,
        false,
        AlbionServer.AMERICAS
      );

      expect(mockDiscordMessage.channel.send).toBeCalledTimes(2);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanned 0/6 registered members...');
      const sentMessage = mockDiscordMessage.channel.send.mock.results[0].value;
      expect(sentMessage.edit).toBeCalledWith('### Scanned 5/6 registered members...');
    });
  });

  describe('Reverse role scanning', () => {
    it('should properly handle when no members were found for any roles', async () => {
      mockDiscordMessage.guild.roles.fetch = jest.fn().mockImplementation(() => {
        return {
          members: [],
        };
      });
      await service.reverseRoleScan(mockDiscordMessage);
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith('🇺🇸 ✅ No invalid users were detected via Reverse Role Scan.');
    });
    it('should take no action against users who registered and have roles', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS]);

      // Ensure mockDiscordUser has the same discordId as the mock registered member
      mockDiscordUser.id = mockRegisteredMemberUS.discordId;

      // Add role they should have
      mockDiscordUser.roles.cache = new Map([
        [mockRegisteredRoleIdUS, TestBootstrapper.getMockDiscordRole('ALB/US/Registered')],
      ]);

      // Mock the Discord API to return the mocked Discord user
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordUser);

      // Ensure when we call for the members of the role the same user is returned.
      mockDiscordMessage.guild.roles.fetch = jest.fn()
        .mockImplementation((roleId: string) => {
          const roleIdsToReturn = [mockRegisteredRoleIdUS];

          // If requested role ID is in the roleIdsToReturnArray, return a mock of the role with the user within it, otherwise mock the role without the user
          if (roleIdsToReturn.includes(roleId)) {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: new Map([
                [mockDiscordUser.id, mockDiscordUser],
              ]),
            };
          }
          else {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: [],
            };
          }
        });

      await service.reverseRoleScan(mockDiscordMessage, false, AlbionServer.AMERICAS);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanning 7 Discord roles for members who are falsely registered...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸 ✅ No invalid users were detected via Reverse Role Scan.');
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    });
    it('should error upon blank role', async () => {
      mockDiscordMessage.guild.roles.fetch = jest.fn().mockImplementation(() => {
        return null;
      });
      await expect(service.reverseRoleScan(mockDiscordMessage)).rejects.toThrowError('Reverse Role Scan: Role @ALB/US/Guildmaster does not seem to exist!');
    });
    it('should error upon Discord role error', async () => {
      const errMsg = 'Discord don\'t like you';
      mockDiscordMessage.guild.roles.fetch = jest.fn().mockImplementationOnce(() => {
        throw new Error(errMsg);
      });
      await expect(service.reverseRoleScan(mockDiscordMessage)).rejects.toThrowError(`Reverse Role Scan: Error fetching role @ALB/US/Guildmaster! Err: ${errMsg}`);
    });
    // I tried
    // it('should error upon Discord role removal error', async () => {
    //    const errMsg = 'Discord don\'t like you';
    //    mockDiscordMessage.guild.roles.fetch = jest.fn().mockImplementation(() => {
    //      return {
    //        name: 'FooRole',
    //        members: new Map<string, any>(mockDiscordUser),
    //      };
    //    });
    //    mockDiscordUser.roles.remove = jest.fn().mockImplementationOnce(() => {
    //      throw new Error(errMsg);
    //    });
    //    await service.reverseRoleScan(mockDiscordMessage);
    //    expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`Reverse Role Scan: Error removing role "FooRole" from user ${mockDiscordUser.displayName} Err: ${errMsg}. Pinging <@${mockDevUserId}>!`);
    //  });
    it('should remove a role from a member who shouldn\'t have it, US', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([]);

      // Add role they shouldn't have
      mockDiscordUser.roles.cache = new Map([
        [mockRegisteredRoleIdUS, TestBootstrapper.getMockDiscordRole('ALB/US/Registered')],
      ]);

      // Mock the Discord API to return the mocked Discord user
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordUser);

      // Ensure when we call for the members of the role the same user is returned.
      mockDiscordMessage.guild.roles.fetch = jest.fn()
        .mockImplementation((roleId: string) => {
          const roleIdsToReturn = [mockRegisteredRoleIdUS];

          // If requested role ID is in the roleIdsToReturnArray, return a mock of the role with the user within it, otherwise mock the role without the user
          if (roleIdsToReturn.includes(roleId)) {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: new Map([
                [mockDiscordUser.id, mockDiscordUser],
              ]),
            };
          }
          else {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: [],
            };
          }
        });

      await service.reverseRoleScan(mockDiscordMessage, false, AlbionServer.AMERICAS);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanning 7 Discord roles for members who are falsely registered...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 🚨 1 errors detected via Reverse Role Scan!\nAffected users have been **automatically** stripped of their incorrect roles.');
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(1);
    });
    it('should remove a role from a member who shouldn\'t have it, EU', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([]);

      // Add role they shouldn't have
      mockDiscordUser.roles.cache = new Map([
        [mockRegisteredRoleId, TestBootstrapper.getMockDiscordRole('ALB/Registered')],
      ]);

      // Mock the Discord API to return the mocked Discord user
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordUser);

      // Ensure when we call for the members of the role the same user is returned.
      mockDiscordMessage.guild.roles.fetch = jest.fn()
        .mockImplementation((roleId: string) => {
          const roleIdsToReturn = [mockRegisteredRoleId];

          // If requested role ID is in the roleIdsToReturnArray, return a mock of the role with the user within it, otherwise mock the role without the user
          if (roleIdsToReturn.includes(roleId)) {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: new Map([
                [mockDiscordUser.id, mockDiscordUser],
              ]),
            };
          }
          else {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: [],
            };
          }
        });

      await service.reverseRoleScan(mockDiscordMessage, false, AlbionServer.EUROPE);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanning 6 Discord roles for members who are falsely registered...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 🚨 1 errors detected via Reverse Role Scan!\nAffected users have been **automatically** stripped of their incorrect roles.');
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(1);
    });
    it('should ignore EU members for a US scan', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS]);

      // Ensure the mock Discord user ID matches the mock EU Registered Member
      mockDiscordUser.id = mockRegisteredMemberUS.discordId;

      // Add a blend of US and EU roles to the user
      mockDiscordUser.roles.cache = new Map([
        [mockRegisteredRoleIdUS, TestBootstrapper.getMockDiscordRole('ALB/US/Registered')],
        [mockRegisteredRoleId, TestBootstrapper.getMockDiscordRole('ALB/Registered')],
        [mockSquireRoleId, TestBootstrapper.getMockDiscordRole('ALB/US/Squire')],
        [mockDiscipleRoleId, TestBootstrapper.getMockDiscordRole('ALB/Disciple')],
      ]);

      // Mock the Discord API to return the mocked Discord user
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordUser);

      // Ensure when we call for the members of the role the same user is returned.
      mockDiscordMessage.guild.roles.fetch = jest.fn()
        .mockImplementation((roleId: string) => {
          const roleIdsToReturn = [mockRegisteredRoleIdUS, mockRegisteredRoleId, mockSquireRoleId, mockDiscipleRoleId];

          // If requested role ID is in the roleIdsToReturnArray, return a mock of the role with the user within it, otherwise mock the role without the user
          if (roleIdsToReturn.includes(roleId)) {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: new Map([
                [mockDiscordUser.id, mockDiscordUser],
              ]),
            };
          }
          else {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: [],
            };
          }
        });

      await service.reverseRoleScan(mockDiscordMessage, false, AlbionServer.AMERICAS);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇺🇸 Scanning 7 Discord roles for members who are falsely registered...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇺🇸 ✅ No invalid users were detected via Reverse Role Scan.');
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    });
    it('should ignore US members for a EU scan', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberEU]);

      // Ensure the mock Discord user ID matches the mock EU Registered Member
      mockDiscordUser.id = mockRegisteredMemberEU.discordId;

      // Add a blend of US and EU roles to the user
      mockDiscordUser.roles.cache = new Map([
        [mockRegisteredRoleIdUS, TestBootstrapper.getMockDiscordRole('ALB/US/Registered')],
        [mockRegisteredRoleId, TestBootstrapper.getMockDiscordRole('ALB/Registered')],
        [mockGeneralRoleId, TestBootstrapper.getMockDiscordRole('ALB/US/General')],
        [mockDiscipleRoleId, TestBootstrapper.getMockDiscordRole('ALB/Disciple')],
      ]);

      // Mock the Discord API to return the mocked Discord user
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordUser);

      // Ensure when we call for the members of the role the same user is returned.
      mockDiscordMessage.guild.roles.fetch = jest.fn()
        .mockImplementation((roleId: string) => {
          const roleIdsToReturn = [mockRegisteredRoleIdUS, mockRegisteredRoleId, mockGeneralRoleId, mockDiscipleRoleId];

          // If requested role ID is in the roleIdsToReturnArray, return a mock of the role with the user within it, otherwise mock the role without the user
          if (roleIdsToReturn.includes(roleId)) {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: new Map([
                [mockDiscordUser.id, mockDiscordUser],
              ]),
            };
          }
          else {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: [],
            };
          }
        });

      await service.reverseRoleScan(mockDiscordMessage, false, AlbionServer.EUROPE);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanning 6 Discord roles for members who are falsely registered...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('🇪🇺 ✅ No invalid users were detected via Reverse Role Scan.');
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    });
    it('should detect any roles that require removal, US', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([]);

      // Add role they shouldn't have
      mockDiscordUser.roles.cache = new Map([
        [mockDiscipleRoleId, TestBootstrapper.getMockDiscordRole('ALB/Disciple')],
      ]);

      // Mock the Discord API to return the mocked Discord user
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordUser);

      // Ensure when we call for the members of the role the same user is returned.
      mockDiscordMessage.guild.roles.fetch = jest.fn()
        .mockImplementation((roleId: string) => {
          const roleIdsToReturn = [mockDiscipleRoleId];

          // If requested role ID is in the roleIdsToReturnArray, return a mock of the role with the user within it, otherwise mock the role without the user
          if (roleIdsToReturn.includes(roleId)) {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: new Map([
                [mockDiscordUser.id, mockDiscordUser],
              ]),
            };
          }
          else {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: [],
            };
          }
        });

      await service.reverseRoleScan(mockDiscordMessage, false, AlbionServer.EUROPE);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanning 6 Discord roles for members who are falsely registered...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 🚨 1 errors detected via Reverse Role Scan!\nAffected users have been **automatically** stripped of their incorrect roles.');
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(1);
    });
    it('should detect 3 roles that require removal for an EU scan, but ignoring US roles', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([]);

      // Add role they shouldn't have
      mockDiscordUser.roles.cache = new Map([
        [mockDiscipleRoleId, TestBootstrapper.getMockDiscordRole('ALB/Disciple')],
        [mockGraduateRoleId, TestBootstrapper.getMockDiscordRole('ALB/Graduate')],
        [mockRegisteredRoleId, TestBootstrapper.getMockDiscordRole('ALB/Registered')],
        [mockRegisteredRoleIdUS, TestBootstrapper.getMockDiscordRole('ALB/US/Registered')],
      ]);

      // Mock the Discord API to return the mocked Discord user
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordUser);

      // Ensure when we call for the members of the role the same user is returned.
      mockDiscordMessage.guild.roles.fetch = jest.fn()
        .mockImplementation((roleId: string) => {
          const roleIdsToReturn = [mockDiscipleRoleId, mockGraduateRoleId, mockRegisteredRoleId, mockRegisteredRoleIdUS];

          // If requested role ID is in the roleIdsToReturnArray, return a mock of the role with the user within it, otherwise mock the role without the user
          if (roleIdsToReturn.includes(roleId)) {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: new Map([
                [mockDiscordUser.id, mockDiscordUser],
              ]),
            };
          }
          else {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: [],
            };
          }
        });

      await service.reverseRoleScan(mockDiscordMessage, false, AlbionServer.EUROPE);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanning 6 Discord roles for members who are falsely registered...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 🚨 3 errors detected via Reverse Role Scan!\nAffected users have been **automatically** stripped of their incorrect roles.');
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(3);
    });
    it('should detect any roles that require removal but take no action in dry run mode', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([]);

      // Add role they shouldn't have
      mockDiscordUser.roles.cache = new Map([
        [mockDiscipleRoleId, TestBootstrapper.getMockDiscordRole('ALB/Disciple')],
      ]);

      // Mock the Discord API to return the mocked Discord user
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordUser);

      // Ensure when we call for the members of the role the same user is returned.
      mockDiscordMessage.guild.roles.fetch = jest.fn()
        .mockImplementation((roleId: string) => {
          const roleIdsToReturn = [mockDiscipleRoleId];

          // If requested role ID is in the roleIdsToReturnArray, return a mock of the role with the user within it, otherwise mock the role without the user
          if (roleIdsToReturn.includes(roleId)) {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: new Map([
                [mockDiscordUser.id, mockDiscordUser],
              ]),
            };
          }
          else {
            return {
              name: 'ALB/MockedRole',
              id: roleId,
              members: [],
            };
          }
        });

      await service.reverseRoleScan(mockDiscordMessage, true, AlbionServer.EUROPE);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('### 🇪🇺 Scanning 6 Discord roles for members who are falsely registered...');
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 🚨 1 errors detected via Reverse Role Scan!\nAffected users have been **automatically** stripped of their incorrect roles.');
      expect(mockDiscordUser.roles.remove).toBeCalledTimes(0);
    });
  });

  describe('Role inconsistencies scanning', () => {
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
        roles: [mockGuildLeaderRoleId, mockRegisteredRoleId],
        highestPriorityRole: { id: mockGuildLeaderRoleId, name: mockGuildLeaderRoleName },
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
        roles: [mockGuildOfficerRoleId, mockRegisteredRoleId],
        highestPriorityRole: { id: mockGuildOfficerRoleId, name: mockOfficerRoleName },
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
        roles: [mockAdeptRoleId, mockRegisteredRoleId],
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
        roles: [mockGraduateRoleId, mockRegisteredRoleId],
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
        roles: [mockDiscipleRoleId, mockRegisteredRoleId],
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
        roles: [mockAdeptRoleId, mockGraduateRoleId, mockDiscipleRoleId, mockRegisteredRoleId],
        highestPriorityRole: { id: mockAdeptRoleId, name: mockAdeptRoleName },
        expected: [
          { id: mockDiscipleRoleId, name: mockDiscipleName, action: 'removed', message: '' },
        ],
        server: AlbionServer.EUROPE,
      },
      {
        title: 'Adepts should have graduate if missing',
        roles: [mockAdeptRoleId, mockRegisteredRoleId],
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
          { id: mockRegisteredRoleId, name: mockRegisteredNameEU, action: 'added', message: '' },
        ],
        server: AlbionServer.EUROPE,
      },
      {
        title: 'Graduates should not have roles of lower priority',
        roles: [mockRegisteredRoleId, mockGraduateRoleId, mockDiscipleRoleId],
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
        title: 'Disciples should always have ALB/Registered role',
        roles: [mockDiscipleRoleId],
        highestPriorityRole: { id: mockDiscipleRoleId, name: mockDiscipleName },
        expected: [
          { id: mockRegisteredRoleId, name: mockRegisteredNameEU, action: 'added', message: '' },
        ],
        server: AlbionServer.EUROPE,
      },
      {
        title: 'Registered members should at least have the entry level role',
        roles: [mockRegisteredRoleId],
        highestPriorityRole: { id: mockRegisteredRoleId, name: mockRegisteredNameEU },
        expected: [
          { id: mockDiscipleRoleId, name: mockDiscipleName, action: 'missingEntryRole', message: '' },
        ],
        server: AlbionServer.EUROPE,
      },
      // {
      //   title: 'US Registered members should have at least ALB/US/Registered and Initiate',
      //   roles: [],
      //   highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
      //   expected: [
      //     { id: mockInitiateRoleId, name: mockInitiateName, action: 'added', message: '' },
      //     { id: mockRegisteredRoleIdUS, name: mockRegisteredNameUS, action: 'added', message: '' },
      //   ],
      //   server: AlbionServer.AMERICAS,
      // },
      {
        title: 'EU Registered members should have at least ALB/Registered and Disciple',
        roles: [],
        highestPriorityRole: { id: mockDiscipleRoleId, name: mockDiscipleName },
        expected: [
          { id: mockDiscipleRoleId, name: mockDiscipleName, action: 'added', message: '' },
          { id: mockRegisteredRoleId, name: mockRegisteredNameEU, action: 'added', message: '' },
        ],
        server: AlbionServer.EUROPE,
      },
      {
        title: 'Dual registrants who have correct roles are not changed upon being scanned based on EU server context',
        roles: [mockRegisteredRoleIdUS, mockRegisteredRoleId, mockDiscipleRoleId, mockInitiateRoleId],
        highestPriorityRole: { id: mockDiscipleRoleId, name: mockDiscipleName },
        expected: [],
        server: AlbionServer.EUROPE,
      },
      {
        title: 'Dual registrants who have correct roles are not changed upon being scanned based on US server context',
        roles: [mockRegisteredRoleIdUS, mockRegisteredRoleId, mockDiscipleRoleId, mockInitiateRoleId],
        highestPriorityRole: { id: mockInitiateRoleId, name: mockInitiateName },
        expected: [],
        server: AlbionServer.AMERICAS,
      },
    ];

    const setupRoleTestMocks = (hasRoles: string[]) => {
      mockDiscordUser.roles.cache.has = jest.fn().mockImplementation((roleId: string) => hasRoles.includes(roleId));
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
    // it('roleInconsistencies should properly indicate progress when multiple users are involved for US', async () => {
    //   mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS, mockRegisteredMemberUS, mockRegisteredMemberUS, mockRegisteredMemberUS, mockRegisteredMemberUS]);
    //   await service.roleInconsistencies(mockDiscordMessage);
    //   expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇺🇸 Scanning 5 members for role inconsistencies... [0/5]');
    // });
    it('roleInconsistencies should properly indicate progress when multiple users are involved for EU', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValueOnce([mockRegisteredMemberUS, mockRegisteredMemberUS, mockRegisteredMemberUS, mockRegisteredMemberUS, mockRegisteredMemberUS]);
      await service.roleInconsistencies(mockDiscordMessage, true, AlbionServer.EUROPE);
      expect(mockDiscordMessage.channel.send).toBeCalledWith('## 🇪🇺 Scanning 5 members for role inconsistencies... [0/5]');
    });
  });
});
