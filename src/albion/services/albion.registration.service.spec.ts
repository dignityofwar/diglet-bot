/* eslint-disable @typescript-eslint/no-explicit-any,max-nested-callbacks */
import { Test } from '@nestjs/testing';
import { AlbionRegistrationService, RegistrationData } from './albion.registration.service';
import { DiscordService } from '../../discord/discord.service';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { ConfigService } from '@nestjs/config';
import { EntityRepository } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionApiService } from './albion.api.service';

const mockRegistrationChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;
const mockAlbionUSMemberRoleId = TestBootstrapper.mockConfig.discord.roles.albionUSMember;
const mockDevUserId = TestBootstrapper.mockConfig.discord.devUserId;

describe('AlbionRegistrationService', () => {
  let service: AlbionRegistrationService;
  let discordService: DiscordService;
  let albionApiService: AlbionApiService;

  let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;
  let mockCharacter: AlbionPlayerInterface;
  let mockDiscordUser: any;
  let mockRegistrationData: RegistrationData;
  let mockRegistrationDataEU: RegistrationData;
  let contactMessage: string;
  let contactMessageEU: string;

  beforeEach(async () => {
    TestBootstrapper.mockORM();
    mockAlbionRegistrationsRepository = TestBootstrapper.getMockEntityRepo();
    mockCharacter = TestBootstrapper.getMockAlbionCharacter(TestBootstrapper.mockConfig.albion.guildIdUS) as any;
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockRegistrationData = {
      discordMember: TestBootstrapper.getMockDiscordUser(),
      character: mockCharacter,
      server: AlbionServer.AMERICAS,
      serverName: 'Americas',
      serverEmoji: '🇺🇸',
      guildId: TestBootstrapper.mockConfig.albion.guildIdUS,
      guildName: 'DIG - Dignity of War',
      guildPingable: '@ALB/US/Guildmaster',
    };
    mockRegistrationDataEU = {
      discordMember: TestBootstrapper.getMockDiscordUser(),
      character: mockCharacter,
      server: AlbionServer.EUROPE,
      serverName: 'Europe',
      serverEmoji: '🇪🇺',
      guildId: TestBootstrapper.mockConfig.albion.guildIdEU,
      guildName: 'Dignity Of War',
      guildPingable: '@ALB/Archmage',
    };
    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRegistrationService,
        ReflectMetadataProvider,
        {
          provide: DiscordService,
          useValue: {
            getChannel: jest.fn().mockResolvedValue(TestBootstrapper.getMockDiscordTextChannel()),
            getMemberRole: jest.fn(),
            getGuildMember: jest.fn(),
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

    // Mocks
    discordService.getMemberRole = jest.fn().mockReturnValue(TestBootstrapper.getMockDiscordRole('123456789'));

    // Fragments
    contactMessage = `If you believe this to be in error, please contact \`${mockRegistrationData.guildPingable}\` in <#1039269706605002912>.`;
    contactMessageEU = `If you believe this to be in error, please contact \`${mockRegistrationDataEU.guildPingable}\` in <#1039269706605002912>.`;

    // Filled spies
    jest.spyOn(service['logger'], 'error');
    jest.spyOn(service['logger'], 'warn');
    jest.spyOn(service['logger'], 'log');
    jest.spyOn(service['logger'], 'debug');
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
  });

  describe('getInfo', () => {
    beforeEach(() => {
      discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser);
      albionApiService.getCharacter = jest.fn().mockResolvedValue(mockCharacter);
    });
    it('should return the correct information for the US server', async () => {
      const result = await service.getInfo(
        mockCharacter.Name,
        AlbionServer.AMERICAS,
        TestBootstrapper.getMockDiscordUser().id,
        'foo1234',
      );
      // There's some weird deep string / object crap going on so we have to compare properties
      expect(result.discordMember).toMatchObject(mockDiscordUser);
      expect(result.character).toMatchObject(mockCharacter);
      expect(result.server).toBe(AlbionServer.AMERICAS);
      expect(result.serverName).toBe('Americas');
      expect(result.serverEmoji).toBe('🇺🇸');
      expect(result.guildId).toBe(TestBootstrapper.mockConfig.albion.guildIdUS);
      expect(result.guildName).toBe('DIG - Dignity of War');
      expect(result.guildPingable).toBe('@ALB/US/Guildmaster');
    });

    it('should return the correct information for the EU server', async () => {
      const result = await service.getInfo(
        mockCharacter.Name,
        AlbionServer.EUROPE,
        TestBootstrapper.getMockDiscordUser().id,
        'foo1234',
      );
      // There's some weird deep string / object crap going on so we have to compare properties
      expect(result.discordMember).toMatchObject(mockDiscordUser);
      expect(result.character).toMatchObject(mockCharacter);
      expect(result.server).toBe(AlbionServer.EUROPE);
      expect(result.serverName).toBe('Europe');
      expect(result.serverEmoji).toBe('🇪🇺');
      expect(result.guildId).toBe(TestBootstrapper.mockConfig.albion.guildIdEU);
      expect(result.guildName).toBe('Dignity Of War');
      expect(result.guildPingable).toBe('@ALB/Archmage');
    });
  });

  describe('validate', () => {
    describe('checkRolesExist', () => {
      it('should throw an error if one of the roles is missing ', async () => {
        discordService.getMemberRole = jest.fn()
          .mockReturnValueOnce({
            id: mockAlbionUSMemberRoleId,
          })
          .mockImplementationOnce(() => {
            throw new Error('Role not found');
          });

        await expect(service.validate(mockRegistrationData)).rejects.toThrowError(`Required Role(s) do not exist! Pinging <@${mockDevUserId}>! Err: Role not found`);
      });
    });

    describe('checkAlreadyRegistered', () => {
      it('should return an error if the character has already been registered by a leaver', async () => {
        mockAlbionRegistrationsRepository.findOne = jest.fn()
          .mockResolvedValueOnce({ discordId: '123456789' })
          .mockResolvedValueOnce(null);
        discordService.getGuildMember = jest.fn().mockResolvedValue(null);

        await expect(service.validate(mockRegistrationData)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered for the ${mockRegistrationData.serverEmoji} ${mockRegistrationData.guildName} Guild, but the user who registered it has left the server.\n\n${contactMessage}`);
      });
      it('should return an error if the character has already been registered by a leaver, EU', async () => {
        mockAlbionRegistrationsRepository.findOne = jest.fn()
          .mockResolvedValueOnce({ discordId: '123456789' })
          .mockResolvedValueOnce(null);
        discordService.getGuildMember = jest.fn().mockResolvedValue(null);

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered for the ${mockRegistrationDataEU.serverEmoji} ${mockRegistrationDataEU.guildName} Guild, but the user who registered it has left the server.\n\n${contactMessageEU}`);
      });
      it('should throw if Discord user has a registration, US', async () => {
        const alreadyRegisteredCharacter = {
          discordId: mockRegistrationDataEU.discordMember.id,
          characterName: 'MuricanDad',
        };
        mockAlbionRegistrationsRepository.findOne = jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(alreadyRegisteredCharacter);
        discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser);

        await expect(service.validate(mockRegistrationData)).rejects.toThrowError(`Sorry <@${mockRegistrationData.discordMember.id}>, you have already registered a character named **${alreadyRegisteredCharacter.characterName}** for the ${mockRegistrationData.serverEmoji} ${mockRegistrationData.guildName} Guild. We don't allow multiple character registrations to the same Discord user.\n\n${contactMessage}`);
      });
      it('should throw if Discord user has a registration, EU', async () => {
        const alreadyRegisteredCharacter = {
          discordId: mockRegistrationDataEU.discordMember.id,
          characterName: 'SomeGuyYouKnow',
        };
        mockAlbionRegistrationsRepository.findOne = jest.fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(alreadyRegisteredCharacter);
        discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser);

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrowError(`Sorry <@${mockRegistrationDataEU.discordMember.id}>, you have already registered a character named **${alreadyRegisteredCharacter.characterName}** for the 🇪🇺 Dignity Of War Guild. We don't allow multiple character registrations to the same Discord user.\n\n${contactMessageEU}`);
      });
      it('should return an error if the character has already been registered by another person (but still on server)', async () => {
        mockAlbionRegistrationsRepository.findOne = jest.fn()
          .mockResolvedValueOnce({ discordId: mockDiscordUser.id })
          .mockResolvedValueOnce(null);
        const mockDiscordUser2 = TestBootstrapper.getMockDiscordUser();
        mockDiscordUser2.id = '987654321';
        mockDiscordUser2.displayName = 'TestUser2';
        discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser2);

        await expect(service.validate(mockRegistrationData)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered for the ${mockRegistrationData.serverEmoji} ${mockRegistrationData.guildName} Guild by Discord user \`@${mockDiscordUser2.displayName}\`.\n\n${contactMessage}`);
      });
      it('should handle Discord failures', async () => {
        mockAlbionRegistrationsRepository.findOne = jest.fn().mockResolvedValue([{ discordId: '123456789' }]);
        discordService.getGuildMember = jest.fn().mockImplementation(() => {
          throw new Error('Discord Error');
        });

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered for the ${mockRegistrationDataEU.serverEmoji} ${mockRegistrationDataEU.guildName} Guild, but the user who registered it has left the server.\n\n${contactMessageEU}`);
        expect(service['logger'].warn).toHaveBeenCalledWith(`Unable to find original Discord user for character "${mockRegistrationData.character.Name}"! Err: Discord Error`);
      });
    });

    describe('checkIfInGuild', () => {
      it('should throw if character is not in US guild', async () => {
        mockCharacter.GuildId = 'utter nonsense';

        const mockCharacterInfo = {
          Id: mockCharacter.Id,
          Name: mockCharacter.Name,
          GuildId: 'utter nonsense',
          GuildName: 'N/A',
          AllianceName: 'N/A',
          AllianceId: 'N/A',
        };

        const endpoint = `https://gameinfo.albiononline.com/api/gameinfo/players/${mockCharacter.Id}`;

        // Pending retry mechanism. Don't forget to move all the lines to the left!
        //      await expect(service.validate(mockRegistrationData)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, the character **${mockCharacter.Name}** has not been detected in the 🇺🇸 **DIG - Dignity of War** Guild.
        // \n- ➡️ **Please ensure you have spelt your character __exactly__ correct as it appears in-game**. If you have mis-spelt it, please run the command again with the correct spelling.
        // - ⏳ We will automatically retry your registration attempt at the top of the hour over the next 24 hours. Sometimes our data source lags, so please be patient. **If you are not a member of DIG, this WILL fail regardless!!!**
        // \nIf _after_ 24 hours this has not worked, please contact \`@ALB/US/Guildmaster\` in <#1039269706605002912> for assistance.
        // \n||Data source: [Gameinfo link](${endpoint}) \nCharacter info: \`${JSON.stringify(mockCharacterInfo)}\`||`);

        await expect(service.validate(mockRegistrationData)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, the character **${mockCharacter.Name}** has not been detected in the 🇺🇸 **DIG - Dignity of War** Guild.
\n- ➡️ **Please ensure you have spelt your character __exactly__ correct as it appears in-game**. If you have mis-spelt it, please run the command again with the correct spelling.
- ⏳ Please wait an hour or so before trying again. Our data source can lag behind reality. It can take up to 24 hours to update.
\n||Data source: [Gameinfo link](${endpoint}) \nCharacter info: \`${JSON.stringify(mockCharacterInfo)}\`||`);
      });

      it('should throw if character is not in EU guild', async () => {
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

        // Pending retry mechanism. Don't forget to move all the lines to the left!
        //         await expect(service.validate(mockRegistrationDataEU)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, the character **${mockCharacter.Name}** has not been detected in the 🇪🇺 **Dignity Of War** Guild.
        // \n- ➡️ **Please ensure you have spelt your character __exactly__ correct as it appears in-game**. If you have mis-spelt it, please run the command again with the correct spelling.
        // - ⏳ We will automatically retry your registration attempt at the top of the hour over the next 24 hours. Sometimes our data source lags, so please be patient. **If you are not a member of DIG, this WILL fail regardless!!!**
        // \nIf _after_ 24 hours this has not worked, please contact \`@ALB/Archmage\` in <#1039269706605002912> for assistance.
        // \n||Data source: [Gameinfo link](${endpoint}) \nCharacter info: \`${JSON.stringify(mockCharacterInfo)}\`||`);

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrowError(`Sorry <@${mockDiscordUser.id}>, the character **${mockCharacter.Name}** has not been detected in the 🇪🇺 **Dignity Of War** Guild.
\n- ➡️ **Please ensure you have spelt your character __exactly__ correct as it appears in-game**. If you have mis-spelt it, please run the command again with the correct spelling.
- ⏳ Please wait an hour or so before trying again. Our data source can lag behind reality. It can take up to 24 hours to update.
\n||Data source: [Gameinfo link](${endpoint}) \nCharacter info: \`${JSON.stringify(mockCharacterInfo)}\`||`);
      });
    });

    it('should return void if all checks pass', async () => {
      mockAlbionRegistrationsRepository.findOne = jest.fn().mockResolvedValue(null);
      discordService.getGuildMember = jest.fn().mockResolvedValue(null);

      await expect(service.validate(mockRegistrationData)).resolves.toBe(undefined);
      expect(service['logger'].debug).toHaveBeenCalledWith(`Registration attempt for "${mockRegistrationData.character.Name}" is valid!`);
    });
  });

  describe('registerCharacter', () => {
    it('should properly handle getCharacter errors, mentioning the user', async () => {
      const errorMsg = 'Some error from the API service';
      albionApiService.getCharacter = jest.fn().mockImplementation(() => {
        throw new Error(errorMsg);
      });

      await expect(service.handleRegistration(
        mockRegistrationData.character.Name,
        mockRegistrationData.server,
        mockRegistrationData.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      )).rejects.toThrowError(errorMsg);
      expect(service['logger'].error).toHaveBeenCalledWith(`Registration failed for character "${mockRegistrationData.character.Name}"! Err: ${errorMsg}`);
    });
    it('should properly handle discord errors, mentioning the user', async () => {
      const errorMsg = 'Some error from Discord';
      albionApiService.getCharacter = jest.fn().mockResolvedValue(mockCharacter);
      discordService.getChannel = jest.fn().mockImplementation(() => {
        throw new Error(errorMsg);
      });

      await expect(service.handleRegistration(
        mockRegistrationData.character.Name,
        mockRegistrationData.server,
        mockRegistrationData.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      )).rejects.toThrowError(errorMsg);
      expect(service['logger'].error).toHaveBeenCalledWith(`Registration failed for character "${mockRegistrationData.character.Name}"! Err: ${errorMsg}`);
    });
    it('should properly handle validation errors', async () => {
      const errorMsg = 'Character is not in the guild!';
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationData);
      service.validate = jest.fn().mockImplementation(() => {
        throw new Error(errorMsg);
      });

      await expect(service.handleRegistration(
        mockRegistrationData.character.Name,
        mockRegistrationData.server,
        mockRegistrationData.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      )).rejects.toThrowError(errorMsg);
      expect(service['logger'].error).toHaveBeenCalledWith(`Registration failed for character "${mockRegistrationData.character.Name}"! Err: ${errorMsg}`);
    });
    it('should add the correct number of roles, US', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationData);
      service.validate = jest.fn().mockResolvedValue(undefined);
      mockRegistrationData.discordMember.roles.add = jest.fn().mockReturnValue(true);

      expect(await service.handleRegistration(
        mockRegistrationData.character.Name,
        mockRegistrationData.server,
        mockRegistrationData.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      ));

      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockRegistrationData.discordMember, TestBootstrapper.mockConfig.discord.roles.albionUSMember);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockRegistrationData.discordMember, TestBootstrapper.mockConfig.discord.roles.albionUSRegistered);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockRegistrationData.discordMember, TestBootstrapper.mockConfig.discord.roles.albionUSAnnouncements);
      expect(mockRegistrationData.discordMember.roles.add).toHaveBeenCalledTimes(3);
    });
    it('should add the correct number of roles, EU', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockResolvedValue(undefined);
      mockRegistrationDataEU.discordMember.roles.add = jest.fn().mockReturnValue(true);

      expect(await service.handleRegistration(
        mockRegistrationDataEU.character.Name,
        mockRegistrationDataEU.server,
        mockRegistrationDataEU.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      ));

      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockRegistrationDataEU.discordMember, TestBootstrapper.mockConfig.discord.roles.albionEUMember);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockRegistrationDataEU.discordMember, TestBootstrapper.mockConfig.discord.roles.albionEURegistered);
      expect(discordService.getMemberRole).toHaveBeenCalledWith(mockRegistrationDataEU.discordMember, TestBootstrapper.mockConfig.discord.roles.albionEUAnnouncements);
      expect(mockRegistrationDataEU.discordMember.roles.add).toHaveBeenCalledTimes(3);
    });
    it('should handle discord role adding errors', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationData);
      service.validate = jest.fn().mockResolvedValue(undefined);
      mockDiscordUser.roles.add = jest.fn()
        .mockResolvedValueOnce(true)
        .mockImplementation(() => {
          throw new Error('Unable to add role');
        });

      await expect(service.handleRegistration(
        mockRegistrationData.character.Name,
        mockRegistrationData.server,
        mockRegistrationData.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id
      )).rejects.toThrowError(`Unable to add roles to "${mockDiscordUser.displayName}"! Pinging <@${mockDevUserId}>!\nErr: Unable to add role`);
    });
    it('should throw upon database error', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockResolvedValue(undefined);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionUSMemberRoleId,
      });
      mockAlbionRegistrationsRepository.upsert = jest.fn().mockImplementation(() => {
        throw new Error('Database done goofed');
      });

      await expect(service.handleRegistration(
        mockRegistrationDataEU.character.Name,
        mockRegistrationDataEU.server,
        mockRegistrationDataEU.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      )).rejects.toThrowError(`Unable to add you to the database! Pinging <@${mockDevUserId}>! Err: Database done goofed`);
    });
    it('should handle discord nickname permission errors by sending a message only', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockResolvedValue(undefined);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionUSMemberRoleId,
      });
      const mockChannel = TestBootstrapper.getMockDiscordTextChannel();
      // Mock the Discord service to return the above mocked channel
      discordService.getChannel = jest.fn().mockResolvedValue(mockChannel);

      mockRegistrationDataEU.discordMember.roles.add = jest.fn().mockReturnValue(true);
      mockRegistrationDataEU.discordMember.setNickname = jest.fn().mockImplementation(() => {
        throw new Error('Unable to set nickname');
      });
      await expect(service.handleRegistration(
        mockRegistrationDataEU.character.Name,
        mockRegistrationDataEU.server,
        mockRegistrationDataEU.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      )).resolves.toBe(undefined);

      const message = `⚠️ Unable to set your nickname. If you're Staff this won't work as the bot has no power over you! Pinging <@${mockDevUserId}>!`;
      expect(mockChannel.send).toBeCalledWith(message);
      // Expect it to log to error log
      expect(service['logger'].error).toHaveBeenCalledWith(message);
    });

    // Successful paths
    it('should handle successful US registration and return a message to the user', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationData);
      service.validate = jest.fn().mockImplementation(() => true);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionUSMemberRoleId,
      });
      mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
      mockDiscordUser.setNickname = jest.fn().mockReturnValue(true);
      const mockChannel = TestBootstrapper.getMockDiscordTextChannel();
      // Mock the Discord service to return the above mocked channel
      discordService.getChannel = jest.fn().mockResolvedValue(mockChannel);

      await expect(service.handleRegistration(
        mockRegistrationData.character.Name,
        mockRegistrationData.server,
        mockRegistrationData.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      )).resolves.toBe(undefined);

      const mockUSOfficerRoleId = TestBootstrapper.mockConfig.albion.guildOfficerRoleUS.discordRoleId;
      const mockUSLeaderRoleId = TestBootstrapper.mockConfig.albion.guildLeaderRoleUS.discordRoleId;

      expect(mockChannel.send).toBeCalledWith({
        content: `# ✅ Thank you <@${mockDiscordUser.id}>, your character **${mockCharacter.Name}** has been registered! 🎉

## 👉️👉️👉️️ NEXT STEP: <#${TestBootstrapper.mockConfig.discord.channels.albionUSRoles}>
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${TestBootstrapper.mockConfig.discord.channels.albionUSAnnouncements}> announcements channel. If you wish to opt out, go to <#${TestBootstrapper.mockConfig.discord.channels.albionUSRoles}>, double tap the 🔔 icon.

CC <@&${mockUSLeaderRoleId}>, <@&${mockUSOfficerRoleId}>`,
        flags: 4,
      });
    });
    it('should handle successful EU registration and return a message to the user', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockImplementation(() => true);
      discordService.getMemberRole = jest.fn().mockReturnValue({
        id: mockAlbionUSMemberRoleId,
      });
      mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
      mockDiscordUser.setNickname = jest.fn().mockReturnValue(true);
      const mockChannel = TestBootstrapper.getMockDiscordTextChannel();
      // Mock the Discord service to return the above mocked channel
      discordService.getChannel = jest.fn().mockResolvedValue(mockChannel);

      await expect(service.handleRegistration(
        mockRegistrationDataEU.character.Name,
        mockRegistrationDataEU.server,
        mockRegistrationDataEU.discordMember.id,
        'foo1234',
        TestBootstrapper.getMockDiscordTextChannel().id,
      )).resolves.toBe(undefined);

      const mockEUOfficerRoleId = TestBootstrapper.mockConfig.albion.guildOfficerRoleEU.discordRoleId;
      const mockEULeaderRoleId = TestBootstrapper.mockConfig.albion.guildLeaderRoleEU.discordRoleId;

      expect(mockChannel.send).toBeCalledWith({
        content: `# ✅ Thank you <@${mockDiscordUser.id}>, your character **${mockCharacter.Name}** has been registered! 🎉

## 👉️👉️👉️️ NEXT STEP: <#${TestBootstrapper.mockConfig.discord.channels.albionEURoles}>
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${TestBootstrapper.mockConfig.discord.channels.albionEUAnnouncements}> announcements channel. If you wish to opt out, go to <#${TestBootstrapper.mockConfig.discord.channels.albionEURoles}>, double tap the 🔔 icon.

CC <@&${mockEULeaderRoleId}>, <@&${mockEUOfficerRoleId}>`,
        flags: 4,
      });
    });
  });
});
