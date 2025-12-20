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
import {
  AlbionRegistrationQueueEntity,
  AlbionRegistrationQueueStatus,
} from '../../database/entities/albion.registration.queue.entity';

const mockRegistrationChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;
const mockAlbionMemberRoleId = TestBootstrapper.mockConfig.discord.roles.albionMember;
const mockDevUserId = TestBootstrapper.mockConfig.discord.devUserId;

describe('AlbionRegistrationService', () => {
  let service: AlbionRegistrationService;
  let discordService: DiscordService;
  let albionApiService: AlbionApiService;

  let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;
  let mockAlbionRegistrationQueueRepository: {
    create: jest.Mock
    upsert: jest.Mock
    findOne: jest.Mock
    flush: jest.Mock
    getEntityManager?: jest.Mock
  };
  let mockCharacter: AlbionPlayerInterface;
  let mockDiscordUser: any;
  let mockRegistrationDataEU: RegistrationData;

  // The registration channel is also the command channel in tests.
  let commandChannel: any;

  let mockChannel: any;
  let contactMessage: string;

  beforeEach(async () => {
    // Shared command/registration channel mock
    commandChannel = {
      ...TestBootstrapper.getMockDiscordTextChannel(),
      id: mockRegistrationChannelId,
      isTextBased: jest.fn().mockReturnValue(true),
      send: jest.fn().mockResolvedValue(true),
    } as any;

    mockAlbionRegistrationsRepository = TestBootstrapper.getMockEntityRepo();

    mockAlbionRegistrationQueueRepository = {
      ...TestBootstrapper.getMockEntityRepo(),
      // Make these explicit jest.fn()s so we can assert on .mock.calls without casting.
      create: jest.fn(),
      upsert: jest.fn(),
      findOne: jest.fn(),
      flush: jest.fn().mockResolvedValue(true),
      getEntityManager: jest.fn().mockReturnValue({
        flush: jest.fn().mockResolvedValue(true),
      }),
    } as any;

    mockCharacter = TestBootstrapper.getMockAlbionCharacter(AlbionServer.EUROPE) as any;
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();

    mockRegistrationDataEU = {
      discordMember: mockDiscordUser,
      character: mockCharacter,
      server: AlbionServer.EUROPE,
      serverName: 'Europe',
      serverEmoji: '🇪🇺',
      guildId: TestBootstrapper.mockConfig.albion.guildId,
      guildName: 'Dignity Of War',
      guildPingable: '@ALB/Archmage',
    };
    mockChannel = TestBootstrapper.getMockDiscordTextChannel();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRegistrationService,
        ReflectMetadataProvider,
        {
          provide: DiscordService,
          useValue: {
            getTextChannel: jest.fn().mockImplementation((channelId: string) => {
              // For these tests, all command interactions happen in the registration channel.
              if (String(channelId) === String(mockRegistrationChannelId)) {
                return commandChannel;
              }
              // Fallback for any other channel lookups.
              return TestBootstrapper.getMockDiscordTextChannel();
            }),
            getMemberRole: jest.fn(),
            getGuildMember: jest.fn().mockResolvedValue(TestBootstrapper.getMockDiscordUser()),
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
        {
          provide: getRepositoryToken(AlbionRegistrationQueueEntity),
          useValue: mockAlbionRegistrationQueueRepository,
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<AlbionRegistrationService>(AlbionRegistrationService);
    discordService = moduleRef.get<DiscordService>(DiscordService);
    albionApiService = moduleRef.get<AlbionApiService>(AlbionApiService);

    // Mocks
    discordService.getRoleViaMember = jest
      .fn()
      .mockReturnValue(TestBootstrapper.getMockDiscordRole('123456789'));

    // Fragments
    contactMessage = `If you believe this to be in error, please contact \`${mockRegistrationDataEU.guildPingable}\` in <#1039269706605002912>.`;

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
      discordService.getTextChannel = jest.fn().mockReturnValue(null);

      await expect(service.onApplicationBootstrap()).rejects.toThrow(
        `Could not find channel with ID ${mockRegistrationChannelId}`,
      );
    });
    it('should throw an error if the channel is not text based', async () => {
      const channel = {
        isTextBased: jest.fn().mockReturnValue(false),
      };
      discordService.getTextChannel = jest.fn().mockReturnValue(channel);

      await expect(service.onApplicationBootstrap()).rejects.toThrow(
        `Channel with ID ${mockRegistrationChannelId} is not a text channel`,
      );
    });
  });

  describe('getInfo', () => {
    beforeEach(() => {
      discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser);
      albionApiService.getCharacter = jest.fn().mockResolvedValue(mockCharacter);
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
      expect(result.guildId).toBe(TestBootstrapper.mockConfig.albion.guildId);
      expect(result.guildName).toBe('Dignity Of War');
      expect(result.guildPingable).toBe('@ALB/Archmage');
    });
  });

  describe('validate', () => {
    describe('checkRolesExist', () => {
      it('should throw an error if one of the roles is missing ', async () => {
        discordService.getRoleViaMember = jest
          .fn()
          .mockReturnValueOnce({
            id: mockAlbionMemberRoleId,
          })
          .mockImplementationOnce(() => {
            throw new Error('Role not found');
          });

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrow(
          `Required Role(s) do not exist! Pinging <@${mockDevUserId}>! Err: Role not found`,
        );
      });
    });

    describe('checkAlreadyRegistered', () => {
      it('should return an error if the character has already been registered by a leaver', async () => {
        mockAlbionRegistrationsRepository.findOne = jest
          .fn()
          .mockResolvedValueOnce({ discordId: '123456789' })
          .mockResolvedValueOnce(null);
        discordService.getGuildMember = jest.fn().mockResolvedValue(null);

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrow(
          `Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered for the ${mockRegistrationDataEU.serverEmoji} ${mockRegistrationDataEU.guildName} Guild, but the user who registered it has left the server.\n\n${contactMessage}`,
        );
      });

      it('should throw if Discord user has a registration', async () => {
        const alreadyRegisteredCharacter = {
          discordId: mockRegistrationDataEU.discordMember.id,
          characterName: 'SomeGuyYouKnow',
        };
        mockAlbionRegistrationsRepository.findOne = jest
          .fn()
          .mockResolvedValueOnce(null)
          .mockResolvedValueOnce(alreadyRegisteredCharacter);
        discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser);

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrow(
          `Sorry <@${mockRegistrationDataEU.discordMember.id}>, you have already registered a character named **${alreadyRegisteredCharacter.characterName}** for the 🇪🇺 Dignity Of War Guild. We don't allow multiple character registrations to the same Discord user.\n\n${contactMessage}`,
        );
      });

      it('should return an error if the character has already been registered by another person (but still on server)', async () => {
        mockAlbionRegistrationsRepository.findOne = jest
          .fn()
          .mockResolvedValueOnce({ discordId: mockDiscordUser.id })
          .mockResolvedValueOnce(null);
        const mockDiscordUser2 = TestBootstrapper.getMockDiscordUser();
        mockDiscordUser2.id = '987654321';
        mockDiscordUser2.displayName = 'TestUser2';
        discordService.getGuildMember = jest.fn().mockResolvedValue(mockDiscordUser2);

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrow(
          `Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered for the ${mockRegistrationDataEU.serverEmoji} ${mockRegistrationDataEU.guildName} Guild by Discord user \`@${mockDiscordUser2.displayName}\`.\n\n${contactMessage}`,
        );
      });

      it('should handle Discord failures', async () => {
        mockAlbionRegistrationsRepository.findOne = jest
          .fn()
          .mockResolvedValue([{ discordId: '123456789' }]);
        discordService.getGuildMember = jest.fn().mockImplementation(() => {
          throw new Error('Discord Error');
        });

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrow(
          `Sorry <@${mockDiscordUser.id}>, character **${mockCharacter.Name}** has already been registered for the ${mockRegistrationDataEU.serverEmoji} ${mockRegistrationDataEU.guildName} Guild, but the user who registered it has left the server.\n\n${contactMessage}`,
        );

        expect(service['logger'].warn).toHaveBeenCalledWith(
          `Unable to find original Discord user for character "${mockRegistrationDataEU.character.Name}"! Err: Discord Error`,
        );
      });
    });

    describe('checkForQueueAttempt', () => {
      it('should throw with registration attempt already queued if an existing attempt exists', async () => {
        mockCharacter.GuildId = 'utter nonsense';

        const existingAttempt: any = {
          guildId: mockRegistrationDataEU.guildId,
          discordId: String(mockDiscordUser.id),
          characterName: 'OldChar',
          server: AlbionServer.EUROPE,
          discordChannelId: 'oldChannel',
          discordGuildId: 'oldGuild',
          status: AlbionRegistrationQueueStatus.PENDING,
          expiresAt: new Date(Date.now() - 1000),
          lastError: 'old error',
        };

        mockAlbionRegistrationQueueRepository.findOne = jest.fn().mockResolvedValue(existingAttempt);

        await expect(service.validate(mockRegistrationDataEU)).rejects.toThrow(
          `Sorry <@${mockDiscordUser.id}>, your registration attempt is **already queued**. Your request will be retried over the next 72 hours. Re-attempting registration is pointless at this time. Please be patient.`,
        );

        // Since queue-check happens before checkIfInGuild, we should not enqueue.
        expect(mockAlbionRegistrationQueueRepository.create).not.toHaveBeenCalled();
        expect(mockAlbionRegistrationQueueRepository.upsert).not.toHaveBeenCalled();
      });
    });

    describe('checkIfInGuild', () => {
      it('should enqueue and throw with pending message if character is not in EU guild', async () => {
        mockCharacter.GuildId = 'utter nonsense';
        mockAlbionRegistrationQueueRepository.findOne = jest.fn().mockResolvedValue(null);

        const before = Date.now();

        await expect(
          service.validate(mockRegistrationDataEU),
        ).rejects.toThrow(
          `Sorry <@${mockDiscordUser.id}>, the character **${mockCharacter.Name}** has not been detected in the 🇪🇺 **Dignity Of War** Guild.\n\n- ➡️ **Please ensure you have spelt your character __exactly__ correct as it appears in-game**. If you have mis-spelt it, please run the command again with the correct spelling.\n- ⏳ **We will automatically retry your registration attempt at the top of the hour for the next 72 hours**. Sometimes our data source lags, so please be patient. **If you are not a member of DIG, this WILL fail regardless.**`,
        );

        expect(mockAlbionRegistrationQueueRepository.upsert).toHaveBeenCalledTimes(1);
        expect(mockAlbionRegistrationQueueRepository.create).toHaveBeenCalledTimes(1);

        // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
        const createArg = mockAlbionRegistrationQueueRepository.create.mock.calls[0][0];
        expect(createArg).toBeTruthy();

        const expiresAt = createArg.expiresAt as Date;

        expect(expiresAt).toBeInstanceOf(Date);
        expect(expiresAt.getTime()).toBeGreaterThanOrEqual(before + 72 * 60 * 60 * 1000 - 10_000);
        expect(expiresAt.getTime()).toBeLessThanOrEqual(before + 72 * 60 * 60 * 1000 + 10_000);
      });
    });

    it('should return void if all checks pass', async () => {
      mockAlbionRegistrationsRepository.findOne = jest.fn().mockResolvedValue(null);
      discordService.getGuildMember = jest.fn().mockResolvedValue(null);

      await expect(service.validate(mockRegistrationDataEU)).resolves.toBe(undefined);
      expect(service['logger'].debug).toHaveBeenCalledWith(
        `Registration attempt for "${mockRegistrationDataEU.character.Name}" is valid!`,
      );
    });
  });

  describe('registerCharacter', () => {
    it('should properly handle getCharacter errors, mentioning the user', async () => {
      const errorMsg = 'Some error from the API service';
      albionApiService.getCharacter = jest.fn().mockImplementation(() => {
        throw new Error(errorMsg);
      });

      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          'foo1234',
          mockChannel.id,
        ),
      ).rejects.toThrow(
        `Registration failed for character "${mockRegistrationDataEU.character.Name}"! Err: ${errorMsg}. Pinging <@${mockDevUserId}>!`,
      );
    });

    it('should properly handle discord channel ID errors', async () => {
      const errorMsg = 'Some error from Discord';
      albionApiService.getCharacter = jest.fn().mockResolvedValue(mockCharacter);
      discordService.getTextChannel = jest.fn().mockImplementation(() => {
        throw new Error(errorMsg);
      });

      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          'foo1234',
          mockChannel.id,
        ),
      ).rejects.toThrow(errorMsg);
      expect(service['logger'].error).toHaveBeenCalledWith(
        `Failed to get channel with ID ${mockChannel.id}! Err: ${errorMsg}. Pinging <@${mockDevUserId}>!`,
      );
    });

    it('should properly handle registration errors, mentioning the user and dev', async () => {
      const errorMsg = 'Registration error!';
      service['checkRolesExist'] = jest.fn().mockImplementation(() => {
        throw new Error(errorMsg);
      });
      albionApiService.getCharacter = jest.fn().mockResolvedValue(mockCharacter);

      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          'foo1234',
          mockChannel.id,
        ),
      ).rejects.toThrow(
        `Registration failed for character "${mockRegistrationDataEU.character.Name}"! Err: ${errorMsg}. Pinging <@${mockDevUserId}>!`,
      );
    });

    it('should properly handle validation errors', async () => {
      const errorMsg = 'Character is not in the guild!';
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockImplementation(() => {
        throw new Error(errorMsg);
      });

      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          'foo1234',
          mockChannel.id,
        ),
      ).rejects.toThrow(
        `Registration failed for character "${mockRegistrationDataEU.character.Name}"! Err: ${errorMsg}. Pinging <@${mockDevUserId}>!`,
      );
    });

    it('should add the correct number of roles', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockResolvedValue(undefined);
      mockRegistrationDataEU.discordMember.roles.add = jest.fn().mockReturnValue(true);

      await service.handleRegistration(
        mockRegistrationDataEU.character.Name,
        mockRegistrationDataEU.server,
        mockRegistrationDataEU.discordMember.id,
        'foo1234',
        mockChannel.id,
      );

      expect(discordService.getRoleViaMember).toHaveBeenCalledWith(
        mockRegistrationDataEU.discordMember,
        TestBootstrapper.mockConfig.discord.roles.albionMember,
      );
      expect(discordService.getRoleViaMember).toHaveBeenCalledWith(
        mockRegistrationDataEU.discordMember,
        TestBootstrapper.mockConfig.discord.roles.albionRegistered,
      );
      expect(discordService.getRoleViaMember).toHaveBeenCalledWith(
        mockRegistrationDataEU.discordMember,
        TestBootstrapper.mockConfig.discord.roles.albionAnnouncements,
      );
      expect(mockRegistrationDataEU.discordMember.roles.add).toHaveBeenCalledTimes(3);
    });

    it('should handle discord role adding errors', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockResolvedValue(undefined);
      mockDiscordUser.roles.add = jest
        .fn()
        .mockResolvedValueOnce(true)
        .mockImplementation(() => {
          throw new Error('Unable to add role');
        });

      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          'foo1234',
          mockChannel.id,
        ),
      ).rejects.toThrow(
        `Unable to add roles to "${mockDiscordUser.displayName}"! Pinging <@${mockDevUserId}>!\nErr: Unable to add role`,
      );
    });

    it('should throw upon database error', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockResolvedValue(undefined);
      discordService.getRoleViaMember = jest.fn().mockReturnValue({
        id: mockAlbionMemberRoleId,
      });
      mockAlbionRegistrationsRepository.upsert = jest.fn().mockImplementation(() => {
        throw new Error('Database done goofed');
      });

      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          'foo1234',
          mockChannel.id,
        ),
      ).rejects.toThrow(
        `Unable to add you to the database! Pinging <@${mockDevUserId}>! Err: Database done goofed`,
      );
    });

    it('should handle discord nickname permission errors by sending a message only', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockResolvedValue(undefined);
      discordService.getRoleViaMember = jest.fn().mockReturnValue({
        id: mockAlbionMemberRoleId,
      });
      // Mock the Discord service to return the above mocked channel
      discordService.getTextChannel = jest.fn().mockResolvedValue(mockChannel);

      mockRegistrationDataEU.discordMember.roles.add = jest.fn().mockReturnValue(true);
      mockRegistrationDataEU.discordMember.setNickname = jest.fn().mockImplementation(() => {
        throw new Error('Unable to set nickname');
      });
      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          'foo1234',
          mockChannel.id,
        ),
      ).resolves.toBe(undefined);

      const message = `⚠️ Unable to set your nickname. If you're Staff this won't work as the bot has no power over you!\nError: "Unable to set nickname".\nPinging <@${mockDevUserId}>!`;
      expect(mockChannel.send).toHaveBeenCalledWith(message);
      // Expect it to log to error log
      expect(service['logger'].error).toHaveBeenCalledWith(message);
    });

    // Successful paths
    it('should handle successful EU registration and return a message to the user', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockImplementation(() => true);
      discordService.getRoleViaMember = jest.fn().mockReturnValue({
        id: mockAlbionMemberRoleId,
      });
      mockDiscordUser.roles.add = jest.fn().mockReturnValue(true);
      mockDiscordUser.setNickname = jest.fn().mockReturnValue(true);
      // Mock the Discord service to return the above mocked channel
      discordService.getTextChannel = jest.fn().mockResolvedValue(mockChannel);

      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          'foo1234',
          mockChannel.id,
        ),
      ).resolves.toBe(undefined);

      const mockEUOfficerRoleId = TestBootstrapper.mockConfig.albion.guildOfficerRole.discordRoleId;
      const mockEULeaderRoleId = TestBootstrapper.mockConfig.albion.guildLeaderRole.discordRoleId;

      expect(mockChannel.send).toHaveBeenCalledWith({
        content: `# ✅ Thank you <@${mockDiscordUser.id}>, your character **${mockCharacter.Name}** has been registered! 🎉

## 👉️👉️👉️️ NEXT STEP: <#${TestBootstrapper.mockConfig.discord.channels.albionRoles}>
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.
* 🔔 You have automatically been enrolled to our <#${TestBootstrapper.mockConfig.discord.channels.albionAnnouncements}> announcements channel. If you wish to opt out, go to <#${TestBootstrapper.mockConfig.discord.channels.albionRoles}>, double tap the 🔔 icon.

CC <@&${mockEULeaderRoleId}>, <@&${mockEUOfficerRoleId}>`,
        flags: 4,
      });
    });

    it('should not create a queue attempt when registration is successful', async () => {
      service.getInfo = jest.fn().mockResolvedValue(mockRegistrationDataEU);
      service.validate = jest.fn().mockResolvedValue(undefined);
      service['registerCharacter'] = jest.fn().mockResolvedValue(undefined);

      await expect(
        service.handleRegistration(
          mockRegistrationDataEU.character.Name,
          mockRegistrationDataEU.server,
          mockRegistrationDataEU.discordMember.id,
          mockRegistrationDataEU.discordMember.guild.id,
          mockChannel.id,
        ),
      ).resolves.toBe(undefined);

      expect(mockAlbionRegistrationQueueRepository.create).not.toHaveBeenCalled();
      expect(mockAlbionRegistrationQueueRepository.upsert).not.toHaveBeenCalled();
    });
  });
});
