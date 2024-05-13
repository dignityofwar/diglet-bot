/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionRegistrationService } from './albion.registration.service';
import { DiscordService } from '../../discord/discord.service';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EntityRepository } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { AlbionApiService } from './albion.api.service';

const mockRegistrationChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;
const mockAlbionUSMemberRoleId = TestBootstrapper.mockConfig.discord.roles.albionUSMember;
const mockAlbionEUMemberRoleId = TestBootstrapper.mockConfig.discord.roles.albionEUMember;
const mockDevUserId = TestBootstrapper.mockConfig.discord.devUserId;

describe('AlbionRegistrationService', () => {
  let service: AlbionRegistrationService;
  let discordService: DiscordService;
  let albionApiService: AlbionApiService;

  let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;
  let mockCharacter: AlbionPlayerInterface;
  let mockDiscordUser: any;
  let mockDiscordMessage: any;
  let mockDto: AlbionRegisterDto;

  beforeEach(async () => {
    TestBootstrapper.mockORM();
    mockAlbionRegistrationsRepository = TestBootstrapper.getMockEntityRepo();
    mockCharacter = TestBootstrapper.getMockAlbionCharacter(TestBootstrapper.mockConfig.albion.guildIdUS) as any;
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

    mockDto = { character: 'Maelstrome26', server: AlbionServer.AMERICAS };
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  // Boostrap and initialization
  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('Bootstrap', () => {
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

    it('should throw an error if one of the roles is missing ', async () => {
      discordService.getMemberRole = jest.fn()
        .mockReturnValueOnce({
          id: mockAlbionUSMemberRoleId,
        })
        .mockImplementationOnce(() => {
          throw new Error('Role not found');
        });

      await expect(service.validateRegistrationAttempt(mockDto, mockCharacter, mockDiscordUser)).rejects.toThrowError(`Required Role(s) do not exist! Pinging <@${mockDevUserId}>! Err: Role not found`);
    });
  });

  describe('Validation', () => {
    it('should return an error if the character has already been registered by another person (and member has left the server)', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValue([{
        discordId: '123456789',
      }]);
      discordService.getGuildMember = jest.fn().mockResolvedValue(null);

      await expect(service.validateRegistrationAttempt(mockDto, mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the Albion Guild Masters in <#1039269706605002912>.`);
    });
    it('should return an error if the character has already been registered by another person (but still on server)', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn().mockResolvedValue([{
        discordId: '123456789',
      }]);
      discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser);

      await expect(service.validateRegistrationAttempt(mockDto, mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered by Discord user \`@${mockDiscordUser.displayName}\`. If this is you, you don't need to do anything. If you believe this to be in error, please contact the Albion Guild Masters in <#1039269706605002912>.`);
    });
    it('should return an error if there is a character registered under the same name on the same server, formatted for US', async () => {
      const discordMemberEntry = {
        characterName: 'TestCharacter',
        guildId: TestBootstrapper.mockConfig.albion.guildIdUS,
      };
      mockAlbionRegistrationsRepository.find = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([discordMemberEntry]);

      await expect(service.validateRegistrationAttempt(mockDto, mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, you have already registered a character named **${discordMemberEntry.characterName}** for the 🇺🇸 Americas Guild. We don't allow multiple Guild characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or if you have registered the wrong character, please contact the Albion Guild Masters in <#1039269706605002912>.`);
    });
    it('should return an error if there is a character registered under the same name on the same server, formatted for EU', async () => {
      mockDto.server = AlbionServer.EUROPE;
      mockCharacter.GuildId = TestBootstrapper.mockConfig.albion.guildIdEU;
      const discordMemberEntry = {
        characterName: 'TestCharacter',
        guildId: TestBootstrapper.mockConfig.albion.guildIdEU,
      };
      mockAlbionRegistrationsRepository.find = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([discordMemberEntry]);

      await expect(service.validateRegistrationAttempt(mockDto, mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, you have already registered a character named **${discordMemberEntry.characterName}** for the 🇪🇺 Europe Guild. We don't allow multiple Guild characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or if you have registered the wrong character, please contact the Albion Archmages in <#1039269706605002912>.`);
    });
    it('should return true if no existing registration was found', async () => {
      mockAlbionRegistrationsRepository.find = jest.fn()
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      await expect(service.validateRegistrationAttempt(mockDto, mockCharacter, mockDiscordUser)).resolves.toBe(true);
    });

    it('should handle characters that are not in the EU guild', async () => {
      mockDto.server = AlbionServer.EUROPE;
      mockCharacter.GuildId = 'utter nonsense';

      const mockCharacterInfo = {
        Id: mockCharacter.Id,
        Name: mockCharacter.Name,
        GuildId: 'utter nonsense',
        GuildName: 'N/A',
        AllianceName: 'N/A',
        AllianceId: 'N/A',
      };

      const endpoint = `https://gameinfo-ams.albiononline.com/api/gameinfo/players/${mockCharacter.Id}`;

      await expect(service.validateRegistrationAttempt(mockDto, mockCharacter, mockDiscordUser)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, the character **${mockCharacter.Name}** has not been detected in the DIG 🇪🇺 Europe Guild. Please ensure that:\n
1. You have spelt the name **exactly** correct (case sensitive).
2. You are a member of the Guild "**Dignity Of War**".
3. You have waited ~10 minutes before trying again (sometimes our data source is slow).
4. You have waited 1 hour before trying again.
\nIf you are still having issues, please contact \`@ALB/EU/Archmage\` in <#1039269706605002912>.
\n||DEV DEBUG: [Gameinfo link](${endpoint}) \nCharacter JSON: \`${JSON.stringify(mockCharacterInfo)}\`||`);
    });
  });

  describe('Registration handling', () => {
    it('should throw an error if the server is not passed from the command', async () => {
      mockDto.server = undefined;
      await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).rejects.toThrowError(`Server was not specified, this shouldn't be possible. Pinging <@${mockDevUserId}>!`);
    });
    it('should handle discord role adding errors', async () => {
      service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionUSMemberRoleId,
      });
      mockDiscordUser.roles.add = jest.fn()
        .mockResolvedValueOnce(true)
        .mockImplementation(() => {
          throw new Error('Unable to add role');
        });
      await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).rejects.toThrowError(`Unable to add roles to "${mockDiscordUser.displayName}"! Pinging <@${mockDevUserId}>!\nErr: Unable to add role`);
    });
    it('should add the correct number of roles, US', async () => {
      service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
      mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
      await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).resolves.toBe(undefined);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockDiscordUser, TestBootstrapper.mockConfig.discord.roles.albionUSMember);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockDiscordUser, TestBootstrapper.mockConfig.discord.roles.albionUSRegistered);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockDiscordUser, TestBootstrapper.mockConfig.discord.roles.albionUSAnnouncements);
      expect(mockDiscordUser.roles.add).toHaveBeenCalledTimes(3);
    });
    it('should add the correct number of roles, EU', async () => {
      mockDto.server = AlbionServer.EUROPE;
      service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
      mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
      await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).resolves.toBe(undefined);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockDiscordUser, TestBootstrapper.mockConfig.discord.roles.albionEUMember);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockDiscordUser, TestBootstrapper.mockConfig.discord.roles.albionEURegistered);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockDiscordUser, TestBootstrapper.mockConfig.discord.roles.albionEUAnnouncements);
      expect(mockDiscordUser.roles.add).toHaveBeenCalledTimes(3);
    });
    it('should return thrown exception upon database error', async () => {
      service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionUSMemberRoleId,
      });
      mockAlbionRegistrationsRepository.upsert = jest.fn().mockImplementation(() => {
        throw new Error('Database done goofed');
      });
      await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).rejects.toThrowError(`Unable to add you to the database! Pinging <@${mockDevUserId}>! Err: Database done goofed`);
    });
    it('should handle discord nickname permission errors', async () => {
      service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionUSMemberRoleId,
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

    // Successful paths
    it('should handle successful US registration and return a message to the user', async () => {
      service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionUSMemberRoleId,
      });
      mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
      mockDiscordUser.setNickname = jest.fn().mockImplementation(() => {
        true;
      });

      await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).resolves.toBe(undefined);

      const mockUSOfficerRoleId = TestBootstrapper.mockConfig.albion.guildOfficerRoleUS.discordRoleId;
      const mockUSLeaderRoleId = TestBootstrapper.mockConfig.albion.guildLeaderRoleUS.discordRoleId;

      expect(mockDiscordMessage.channel.send).toBeCalledWith({
        content: `# ✅ Thank you <@${mockDiscordUser.id}>, your character **${mockCharacter.Name}** has been registered! 🎉

## 👉️👉️👉️️ NEXT STEP: <#${TestBootstrapper.mockConfig.discord.channels.albionUSRoles}>
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${TestBootstrapper.mockConfig.discord.channels.albionUSAnnouncements}> announcements channel. If you wish to opt out, go to <#${TestBootstrapper.mockConfig.discord.channels.albionUSRoles}>, double tap the 🔔 icon.

CC <@&${mockUSLeaderRoleId}>, <@&${mockUSOfficerRoleId}>`,
        flags: 4,
      });
      expect(mockDiscordMessage.delete).toBeCalled();
    });
    it('should handle successful EU registration and return a message to the user', async () => {
      mockDto.server = AlbionServer.EUROPE;
      service.validateRegistrationAttempt = jest.fn().mockImplementation(() => true);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionEUMemberRoleId,
      });
      mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
      mockDiscordUser.setNickname = jest.fn().mockImplementation(() => {
        true;
      });

      await expect(service.handleRegistration(mockDto, mockDiscordUser, mockDiscordMessage)).resolves.toBe(undefined);

      const mockEUOfficerRoleId = TestBootstrapper.mockConfig.albion.guildOfficerRoleEU.discordRoleId;
      const mockEULeaderRoleId = TestBootstrapper.mockConfig.albion.guildLeaderRoleEU.discordRoleId;

      expect(mockDiscordMessage.channel.send).toBeCalledWith({
        content: `# ✅ Thank you <@${mockDiscordUser.id}>, your character **${mockCharacter.Name}** has been registered! 🎉

## 👉️👉️👉️️ NEXT STEP: <#${TestBootstrapper.mockConfig.discord.channels.albionEURoles}>
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${TestBootstrapper.mockConfig.discord.channels.albionEUAnnouncements}> announcements channel. If you wish to opt out, go to <#${TestBootstrapper.mockConfig.discord.channels.albionEURoles}>, double tap the 🔔 icon.

CC <@&${mockEULeaderRoleId}>, <@&${mockEUOfficerRoleId}>`,
        flags: 4,
      });
      expect(mockDiscordMessage.delete).toBeCalled();
    });
  });
});
