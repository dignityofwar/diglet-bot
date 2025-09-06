/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PurgableMemberList, PurgeService } from './purge.service';
import { TestBootstrapper } from '../../test.bootstrapper';
import { Collection, GuildMember } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { ActivityService } from './activity.service';

// Helper function to create a mock member
interface MockMemberOptions {
  isBot: boolean;
  roles: {
    onboarded: boolean;
    ps2?: boolean;
    foxhole?: boolean;
    albion?: boolean;
  };
  withinGrace: boolean;
  active: boolean;
  nickname?: string;
}

describe('PurgeService', () => {
  let service: PurgeService;
  let mockActivityService: ActivityService;
  let mockMessage: any;
  let mockDiscordService: DiscordService;
  const mockActivityEntity = {
    discordId: '123456',
    discordNickname: 'testuser',
  } as ActivityEntity;
  const mockActivityRepository =
    TestBootstrapper.getMockRepositoryInjected(mockActivityEntity);
  const mockRole = TestBootstrapper.getMockDiscordRole('123456789');
  const activeMembers = new Collection<string, GuildMember>();
  const generatedMembers = new Collection<string, GuildMember>();
  const validCount = 50;
  const inGraceCount = 5;
  const purgableCount = 11;
  const botCount = 4;
  const inactiveCount = 6;

  const mockRoleOnboarded = TestBootstrapper.getMockDiscordRole('353464645454');
  mockRoleOnboarded.name = 'Onboarded';
  const mockRolePS2 = TestBootstrapper.getMockDiscordRole('123456789');
  mockRolePS2.name = 'Rec/Planetside2';
  const mockRolePS2Verified = TestBootstrapper.getMockDiscordRole('234567890');
  mockRolePS2Verified.name = 'Rec/PS2Verified';
  const mockRoleFoxhole = TestBootstrapper.getMockDiscordRole('345678901');
  mockRoleFoxhole.name = 'Foxhole';
  const mockRoleAlbion = TestBootstrapper.getMockDiscordRole('456789012');
  mockRoleAlbion.name = 'Albion';
  const mockRoleAlbionEURegistered =
    TestBootstrapper.getMockDiscordRole('678901234');
  const devUserId = TestBootstrapper.mockConfig.discord.devUserId;

  const goodbyeMessage = `Hello from DIG!\n
We have removed you from the DIG Discord server due to either:
- Failing to complete the onboarding process to our server within 1 week of joining.
- Being inactive for 90 days. 
  - We choose to keep our server member counts as accurate as possible so we don't impose the impression we are larger than we actually are, and to keep our game role statistics accurate. We use these heavily to determine how active each of our games are.

Should you believe this to be in error, or you simply wish to rejoin, please click here: https://discord.gg/joinDIG

Otherwise, thank you for having joined us, and we wish you all the best. Please note messages to this bot are not monitored.

DIG Community Staff`;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PurgeService,
        ConfigService,
        {
          provide: DiscordService,
          useValue: {
            getGuildMember: jest.fn(),
            kickMember: jest.fn(),
            deleteMessage: jest.fn().mockReturnValue(() => true),
            batchSend: jest.fn(),
            sendDM: jest.fn(),
          },
        },
        {
          provide: ActivityService,
          useValue: {
            removeActivityRecord: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(ActivityEntity),
          useValue: mockActivityRepository,
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<PurgeService>(PurgeService);
    mockDiscordService = moduleRef.get<DiscordService>(DiscordService);
    mockActivityService = moduleRef.get<ActivityService>(ActivityService);

    mockMessage = TestBootstrapper.getMockDiscordMessage();

    mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
      id: '123',
    });
    // Mock fetch implementation
    mockMessage.guild.members.fetch = jest.fn().mockImplementation(() => {
      return {
        size: generatedMembers.size,
        sort: () => generatedMembers,
        filter: (
          callback: (
            value: GuildMember,
            key: string,
            collection: Collection<string, GuildMember>,
          ) => key is string,
        ) =>
          new Collection(
            generatedMembers
              .filter(callback)
              .map((member) => [member.user.id, member]),
          ),
        values: () =>
          generatedMembers.map((member) => {
            return {
              ...member,
              fetch: jest.fn().mockResolvedValue(member),
              kick: jest.fn().mockImplementation(() => true),
            };
          }),
      };
    });

    activeMembers.clear();

    const membersData = [
      createMockMember(
        {
          isBot: false,
          roles: { onboarded: false },
          withinGrace: false,
          active: true,
        },
        purgableCount,
        0,
      ), // Purgable, out of grace, no role
      createMockMember(
        {
          isBot: false,
          roles: { onboarded: true },
          withinGrace: false,
          active: false,
        },
        inactiveCount,
        1,
      ), // Purgable, inactive member
      createMockMember(
        {
          isBot: false,
          roles: { onboarded: true },
          withinGrace: false,
          active: true,
        },
        validCount,
        2,
      ), // NOT purgable, active and normal member
      createMockMember(
        {
          isBot: false,
          roles: { onboarded: false },
          withinGrace: true,
          active: true,
        },
        inGraceCount,
        3,
      ), // NOT purgable, within grace
      createMockMember(
        {
          isBot: true,
          roles: { onboarded: false },
          withinGrace: false,
          active: true,
        },
        botCount,
        4,
      ), // Not purgable, bot
    ];

    // Collect all .members from each created member object
    const generatedMembersArray = membersData.flatMap(
      (member) => member.members || [],
    );

    // Populate the members Collection
    generatedMembersArray.forEach((member) => {
      generatedMembers.set(member.user.id, member);
    });

    // Populate the activeMembers collection
    membersData.forEach((member) => {
      if (member.actives) {
        member.actives.forEach((active) => {
          activeMembers.set(active.user.id, active);
        });
      }
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('startPurge', () => {
    it('should handle preflightChecks errors', async () => {
      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      service.preflightChecks = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      expect(await service.startPurge(mockMessage as any, false)).toBe(
        undefined,
      );

      expect(newStatusMessage.channel.send).toHaveBeenCalledWith(
        '## ❌ Error commencing the purge!\n' +
          'Preflight checks failed! Err: Test error',
      );
    });

    it('should handle any errors from getPurgableMembers', async () => {
      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      service.getPurgableMembers = jest.fn().mockImplementation(() => {
        throw new Error('Something went boom');
      });

      expect(await service.startPurge(mockMessage as any, false)).toBe(
        undefined,
      );

      expect(newStatusMessage.channel.send).toHaveBeenCalledWith(
        '## ❌ Error commencing the purge!\n' + 'Something went boom',
      );
    });

    it('should respond accordingly when there are no purgables', async () => {
      service.getPurgableMembers = jest.fn().mockResolvedValue({
        purgableMembers: new Collection(),
        totalMembers: 0,
        totalBots: 0,
        totalHumans: 0,
        inGracePeriod: 0,
        inactive: 0,
      });

      expect(await service.startPurge(mockMessage as any, false)).toBe(
        undefined,
      );

      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        '## ✅ All members are active and onboarded.\nThey have been saved from Thanos, this time...',
      );
    });

    it('should handle errors from the kick purgable members function', async () => {
      service.kickPurgableMembers = jest.fn().mockImplementation(() => {
        throw new Error('Something went boom when kicking!');
      });

      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      const returnedData = {
        purgableMembers: generatedMembers,
        totalMembers: 1,
        totalBots: 1,
        totalHumans: 1,
        inGracePeriod: 1,
        inactive: 1,
      };
      service.getPurgableMembers = jest.fn().mockResolvedValue(returnedData);

      const mockDiscordUser = TestBootstrapper.getMockDiscordUser();

      expect(
        await service.startPurge(mockMessage as any, false, mockDiscordUser),
      ).toBe(undefined);

      expect(service.kickPurgableMembers).toHaveBeenCalledWith(
        mockMessage,
        returnedData.purgableMembers,
        false,
      );
      expect(newStatusMessage.edit).toHaveBeenCalledWith(
        '## ❌ Error purging members!\nSomething went boom when kicking!',
      );
    });

    it('should commence the purge when purgables exist, and communicate progress', async () => {
      service.kickPurgableMembers = jest.fn();

      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      const purgablesMock = {
        purgableMembers: generatedMembers,
        totalMembers: 50,
        totalBots: 4,
        totalHumans: 46,
        inGracePeriod: 5,
        inactive: 6,
      };
      service.getPurgableMembers = jest.fn().mockResolvedValue(purgablesMock);
      service.generateReport = jest.fn().mockResolvedValue(undefined);

      const mockDiscordUser = TestBootstrapper.getMockDiscordUser();

      expect(
        await service.startPurge(mockMessage as any, false, mockDiscordUser),
      ).toBe(undefined);

      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Snapping fingers...',
      );
      expect(newStatusMessage.edit).toHaveBeenCalledWith(
        `Found ${purgablesMock.purgableMembers.size} members who have disobeyed Thanos...\nI don't feel too good Mr Stark...`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'https://media2.giphy.com/media/XzkGfRsUweB9ouLEsE/giphy.gif',
      );
      expect(service.kickPurgableMembers).toHaveBeenCalledWith(
        mockMessage,
        purgablesMock.purgableMembers,
        false,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'https://media1.tenor.com/m/g0oFjHy6W1cAAAAC/thanos-smile.gif',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        '## ✅ Purge complete.',
      );
      expect(service.generateReport).toHaveBeenCalledWith(
        purgablesMock,
        mockMessage,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `Thanos thanks you for your service, <@${mockDiscordUser.id}>.`,
      );
    });
  });

  describe('preflightChecks', () => {
    it('should return the roles in order', async () => {
      mockRoleAlbionEURegistered.name = 'AlbionEURegistered';

      mockMessage.guild.roles.cache.find = jest
        .fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(mockRoleFoxhole)
        .mockReturnValueOnce(mockRoleAlbion)
        .mockReturnValueOnce(mockRoleAlbionEURegistered);

      const result = service.preflightChecks(mockMessage as any);

      expect(result.onboardedRole).toBe(mockRoleOnboarded);
      expect(result.ps2Role).toBe(mockRolePS2);
      expect(result.ps2VerifiedRole).toBe(mockRolePS2Verified);
      expect(result.foxholeRole).toBe(mockRoleFoxhole);
      expect(result.albionRole).toBe(mockRoleAlbion);
      expect(result.albionRegistered).toBe(mockRoleAlbionEURegistered);
    });

    it('should throw an error if the Onboarded role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest.fn().mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(
        `Could not find Onboarded role! Pinging Bot Dev <@${devUserId}>!`,
      );
    });
    it('should throw an error if the Rec/Planetside2 role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest
        .fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(
        `Could not find Rec/Planetside2 role! Pinging Bot Dev <@${devUserId}>!`,
      );
    });
    it('should throw an error if the PS2/Verified role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest
        .fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(
        `Could not find Rec/PS2/Verified role! Pinging Bot Dev <@${devUserId}>!`,
      );
    });
    it('should throw an error if the Rec/Foxhole role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest
        .fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(
        `Could not find Rec/Foxhole role! Pinging Bot Dev <@${devUserId}>!`,
      );
    });
    it('should throw an error if the Albion Online role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest
        .fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(mockRoleFoxhole)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(
        `Could not find Albion Online role! Pinging Bot Dev <@${devUserId}>!`,
      );
    });
    it('should throw an error if the Albion Online registered US role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest
        .fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(mockRoleFoxhole)
        .mockReturnValueOnce(mockRoleAlbion)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(
        `Could not find Albion Online registered role(s)! Pinging Bot Dev <@${devUserId}>!`,
      );
    });

    it('should throw an error if the Albion Online registered EU role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest
        .fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(mockRoleFoxhole)
        .mockReturnValueOnce(mockRoleAlbion)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(
        `Could not find Albion Online registered role(s)! Pinging Bot Dev <@${devUserId}>!`,
      );
    });
  });

  describe('getPurgableMembers', () => {
    it('should handle preflightChecks errors', async () => {
      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      service.preflightChecks = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      expect(await service.startPurge(mockMessage as any, false)).toBe(
        undefined,
      );

      expect(newStatusMessage.channel.send).toHaveBeenCalledWith(
        '## ❌ Error commencing the purge!\nPreflight checks failed! Err: Test error',
      );
    });
    it('should handle errors when fetching members list from Discord', async () => {
      service.resolveActiveMembers = jest
        .fn()
        .mockResolvedValue(new Collection(activeMembers));
      mockMessage.guild.members.fetch = jest
        .fn()
        .mockRejectedValue(new Error('Test error'));
      expect(await service.getPurgableMembers(mockMessage as any, true)).toBe(
        undefined,
      );

      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Error fetching Discord server members. Err: Test error',
      );
    });
    // I tried, we're in promise land here and it's mental.
    // it('should properly handle when a member fetch fails', async () => {
    //   // Mock the role finding
    //   mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
    //     id: '123',
    //   });
    //
    //   // Mock the resolveActiveMembers method
    //   service.resolveActiveMembers = jest.fn().mockResolvedValue(new Collection(activeMembers));
    //
    //   // Mock the members with fetch method rejecting
    //   const mockedGeneratedMembers = generatedMembers.map(member => {
    //     return {
    //       ...member,
    //       fetch: jest.fn().mockRejectedValue(new Error('Discord went boom!')),
    //     };
    //   });
    //
    //   // Mock the sortMembers method
    //   service.sortMembers = jest.fn().mockReturnValue({
    //     values: () => mockedGeneratedMembers,
    //     filter: jest.fn(),
    //   });
    //
    //   // Mock the getTextChannel(message).send method
    //   mockMessage.channel.send = jest.fn();
    //
    //   // Mock the fetch method on the guild members
    //   mockMessage.guild.members.fetch = jest.fn().mockImplementation(() => {
    //     return {
    //       size: generatedMembers.size,
    //       sort: () => new Collection(mockedGeneratedMembers.map(member => [member.user.id, member])),
    //       filter: (callback: (value: GuildMember, key: string, collection: Collection<string, GuildMember>) => key is string) =>
    //         new Collection(generatedMembers.filter(callback).map(member => [member.user.id, member])),
    //       values: () => mockedGeneratedMembers,
    //     };
    //   });
    //
    //   // Run the method and expect the catch block to execute
    //   const result = await service.getPurgableMembers(mockMessage as any, true);
    //
    //   // Check that the result is undefined as expected
    //   expect(result).toBe(undefined);
    //
    //   // Check that the error message was sent to the channel
    //   expect(mockMessage.channel.send).toHaveBeenCalledWith('Error refreshing member cache. Err: Discord went boom!');
    // });

    it('should properly calculate purgable members and all other metrics', async () => {
      mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
        id: '123',
      });

      service.resolveActiveMembers = jest
        .fn()
        .mockResolvedValue(new Collection(activeMembers));

      const result = await service.getPurgableMembers(mockMessage as any, true);

      expect(result.purgableMembers.size).toBe(purgableCount + inactiveCount);
      expect(result.totalMembers).toBe(generatedMembers.size);
      expect(result.totalBots).toBe(botCount);
      expect(result.totalHumans).toBe(generatedMembers.size - botCount);
      expect(result.inGracePeriod).toBe(inGraceCount);
      expect(result.inactive).toBe(inactiveCount);
    });
  });

  describe('resolveActiveMembers', () => {
    it('should return the expected number of active members', async () => {
      // Create a placeholder for the new message
      const newStatusMessage = TestBootstrapper.getMockDiscordMessage();

      // Mock send to return the exact instance of the new message so tests continue to work.
      mockMessage.channel.send = jest.fn().mockImplementation(async () => {
        return newStatusMessage;
      });
      const mockActives = createMockActiveRecords(10);

      mockActivityRepository.find = jest.fn().mockResolvedValue(mockActives);
      mockDiscordService.getGuildMember = jest.fn().mockResolvedValue({});

      const result = await service.resolveActiveMembers(mockMessage, false);

      expect(result.size).toBe(10);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Getting active Discord members [0/10] (0%)...',
      );
      expect(newStatusMessage.edit).toHaveBeenCalledWith(
        'Getting active Discord members [10/10] (100%)...',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Detected **10** active members!',
      );
      expect(newStatusMessage.delete).toHaveBeenCalled();
    });
    it('should handle server leavers', async () => {
      const mockActives = createMockActiveRecords(4);

      mockActivityRepository.find = jest.fn().mockResolvedValue(mockActives);
      mockDiscordService.getGuildMember = jest
        .fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({});

      const result = await service.resolveActiveMembers(mockMessage, false);

      expect(result.size).toBe(2);
      expect(mockActivityService.removeActivityRecord).toHaveBeenCalledWith(
        mockActives[1],
        false,
      );
      expect(mockActivityService.removeActivityRecord).toHaveBeenCalledWith(
        mockActives[2],
        false,
      );
      expect(mockActivityService.removeActivityRecord).not.toHaveBeenCalledWith(
        mockActives[0],
        false,
      );
      expect(mockActivityService.removeActivityRecord).toHaveBeenCalledTimes(2);
    });
    it('should handle database errors for removing activity records', async () => {
      const mockActives = createMockActiveRecords(1);

      mockActivityRepository.find = jest.fn().mockResolvedValue(mockActives);
      mockDiscordService.getGuildMember = jest.fn().mockResolvedValueOnce(null);

      mockActivityService.removeActivityRecord = jest
        .fn()
        .mockImplementation(() => {
          throw new Error('Activity database went wonky');
        });

      await service.resolveActiveMembers(mockMessage, false);

      const errorMsg = `<@${devUserId}> Error removing activity record for leaver ${mockActives[0].discordNickname} (${mockActives[0].discordId}). Error: Activity database went wonky`;
      expect(mockMessage.channel.send).toHaveBeenCalledWith(errorMsg);
    });
  });

  describe('isPurgable', () => {
    it('should not mark someone as purgable if they pass all the criteria', async () => {
      const mockMembers = createMockMember(
        {
          isBot: false,
          roles: { onboarded: true },
          withinGrace: false,
          active: true,
        },
        1,
      );

      activeMembers.set(mockMembers.members[0].user.id, mockMembers.actives[0]);

      expect(
        service.isPurgable(mockMembers.members[0], activeMembers, mockRole),
      ).toBe(false);
    });
    it('should not mark a member as purgable if they are a bot', async () => {
      const mockMembers = createMockMember(
        {
          isBot: true,
          roles: { onboarded: false },
          withinGrace: false,
          active: true,
        },
        1,
      );

      expect(
        service.isPurgable(mockMembers.members[0], activeMembers, mockRole),
      ).toBe(false);
    });
    it('should not mark a member as purgable if they are freshly joined and not onboarded', async () => {
      const mockMembers = createMockMember(
        {
          isBot: false,
          roles: { onboarded: false },
          withinGrace: true,
          active: true,
        },
        1,
      );

      expect(
        service.isPurgable(mockMembers.members[0], activeMembers, mockRole),
      ).toBe(false);
    });
    it('should mark someone as purgable if they are inactive', async () => {
      const mockMembers = createMockMember(
        {
          isBot: false,
          roles: { onboarded: true },
          withinGrace: false,
          active: false,
        },
        1,
      );

      expect(
        service.isPurgable(mockMembers.members[0], activeMembers, mockRole),
      ).toBe(true);
    });
    it('should mark someone as purgable if they are not onboarded and out of grace period', async () => {
      const mockMembers = createMockMember(
        {
          isBot: false,
          roles: { onboarded: false },
          withinGrace: false,
          active: true,
        },
        1,
      );

      expect(
        service.isPurgable(mockMembers.members[0], activeMembers, mockRole),
      ).toBe(true);
    });
  });

  describe('kickPurgableMembers', () => {
    it('should call the kick function for one purgable member', async () => {
      const purgables = createMockMember(
        {
          isBot: false,
          roles: { onboarded: false },
          withinGrace: false,
          active: true,
        },
        1,
      );

      const purgableMembers = new Collection(
        purgables.members.map((member) => [member.user.id, member]),
      );

      await service.kickPurgableMembers(
        mockMessage as any,
        purgableMembers,
        false,
      );

      const count = purgableMembers.size;
      const date = new Date().toLocaleString();

      expect(mockDiscordService.sendDM).toHaveBeenCalledWith(
        purgables.members[0],
        goodbyeMessage,
      );
      expect(mockDiscordService.kickMember).toHaveBeenCalledWith(
        purgables.members[0],
        mockMessage,
        `Automatic purge: ${date}`,
      );
      expect(mockDiscordService.deleteMessage).toHaveBeenCalledTimes(1);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `Kicking ${count} purgable members...`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Kicking started...',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `- 🥾 Kicked ${purgables.members[0].nickname} (${purgables.members[0].user.id})\n`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        '🫰 Kicking progress: [1/1] (100%)',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `**${count}** members purged.`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledTimes(5);
    });

    it('should call the kick function for multiple purgable members', async () => {
      const purgables = createMockMember(
        {
          isBot: false,
          roles: { onboarded: false },
          withinGrace: false,
          active: true,
        },
        5,
      );

      const purgableMembers = new Collection(
        purgables.members.map((member) => [member.user.id, member]),
      );

      await service.kickPurgableMembers(
        mockMessage as any,
        purgableMembers,
        false,
      );

      const count = purgableMembers.size;

      expect(mockDiscordService.sendDM).toHaveBeenCalledTimes(count);
      expect(mockDiscordService.kickMember).toHaveBeenCalledTimes(count);
      expect(mockDiscordService.deleteMessage).toHaveBeenCalledTimes(1);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `Kicking ${count} purgable members...`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Kicking started...',
      );
      expect(mockMessage.channel.send)
        .toHaveBeenCalledWith(`- 🥾 Kicked 1-0Nick (1-0)
- 🥾 Kicked 1-1Nick (1-1)
- 🥾 Kicked 1-2Nick (1-2)
- 🥾 Kicked 1-3Nick (1-3)
- 🥾 Kicked 1-4Nick (1-4)
`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        '🫰 Kicking progress: [5/5] (100%)',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `**${count}** members purged.`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledTimes(5);
    });

    it('should call the kick function for each purgable member more than batch limit', async () => {
      const purgables = createMockMember(
        {
          isBot: false,
          roles: { onboarded: false },
          withinGrace: false,
          active: true,
        },
        6,
      );

      const purgableMembers = new Collection(
        purgables.members.map((member) => [member.user.id, member]),
      );

      await service.kickPurgableMembers(
        mockMessage as any,
        purgableMembers,
        false,
      );

      const count = purgableMembers.size;

      expect(mockDiscordService.sendDM).toHaveBeenCalledTimes(count);
      expect(mockDiscordService.kickMember).toHaveBeenCalledTimes(count);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `Kicking ${count} purgable members...`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Kicking started...',
      );
      expect(mockMessage.channel.send)
        .toHaveBeenCalledWith(`- 🥾 Kicked 1-0Nick (1-0)
- 🥾 Kicked 1-1Nick (1-1)
- 🥾 Kicked 1-2Nick (1-2)
- 🥾 Kicked 1-3Nick (1-3)
- 🥾 Kicked 1-4Nick (1-4)
`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        '🫰 Kicking progress: [5/6] (83%)',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        '- 🥾 Kicked 1-5Nick (1-5)\n',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        '🫰 Kicking progress: [6/6] (100%)',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `**${count}** members purged.`,
      );
    });

    it('should NOT call the kick function for each purgable member for a DRY RUN', async () => {
      const purgables = createMockMember(
        {
          isBot: false,
          roles: { onboarded: false },
          withinGrace: false,
          active: true,
        },
        1,
      );

      const purgableMembers = new Collection(
        purgables.members.map((member) => [member.user.id, member]),
      );

      await service.kickPurgableMembers(
        mockMessage as any,
        purgableMembers,
        true,
      );

      const count = purgableMembers.size;

      expect(mockDiscordService.sendDM).toHaveBeenCalledTimes(0);
      expect(mockDiscordService.kickMember).toHaveBeenCalledTimes(0);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `Kicking ${count} purgable members...`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        'Kicking started...',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `- [DRY RUN] 🥾 Kicked ${purgables.members[0].nickname} (${purgables.members[0].user.id})\n`,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        '[DRY RUN] 🫰 Kicking progress: [1/1] (100%)',
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        `[DRY RUN] **${count}** members purged.`,
      );
    });
  });

  describe('sortMembers', () => {
    it('should sort members by display name', () => {
      const members = new Collection<string, GuildMember>();
      const mockMembers = createMockMember(
        {
          isBot: false,
          roles: { onboarded: true },
          withinGrace: false,
          active: true,
        },
        3,
      );
      members.set(mockMembers.members[0].user.id, {
        ...mockMembers.members[0],
        displayName: 'Charlie',
      });
      members.set(mockMembers.members[1].user.id, {
        ...mockMembers.members[1],
        displayName: 'Alice',
      });
      members.set(mockMembers.members[2].user.id, {
        ...mockMembers.members[2],
        displayName: 'Bob',
      });

      const sortedMembers = service.sortMembers(members);

      const sortedKeys = sortedMembers.map((member) => member.user.id);
      expect(sortedKeys).toEqual([
        mockMembers.members[1].user.id,
        mockMembers.members[2].user.id,
        mockMembers.members[0].user.id,
      ]); // Alice, Bob, Charlie
    });

    it('should sort members by nickname when display name is absent', () => {
      const members = new Collection<string, GuildMember>();
      const mockMembers = createMockMember(
        {
          isBot: false,
          roles: { onboarded: true },
          withinGrace: false,
          active: true,
        },
        3,
      );
      members.set(mockMembers.members[0].user.id, mockMembers.members[0]);
      members.set(mockMembers.members[1].user.id, mockMembers.members[1]);
      members.set(mockMembers.members[2].user.id, mockMembers.members[2]);

      const sortedMembers = service.sortMembers(members);

      const sortedKeys = sortedMembers.map((member) => member.user.id);
      expect(sortedKeys).toEqual([
        mockMembers.members[0].user.id,
        mockMembers.members[1].user.id,
        mockMembers.members[2].user.id,
      ]); // 1-0Nick, 1-1Nick, 1-2Nick
    });

    it('should sort members by username when display name and nickname are absent', () => {
      const members = new Collection<string, GuildMember>();
      const mockMembers = createMockMember(
        {
          isBot: false,
          roles: { onboarded: true },
          withinGrace: false,
          active: true,
        },
        3,
      );
      members.set(mockMembers.members[0].user.id, {
        ...mockMembers.members[0],
        nickname: null,
      });
      members.set(mockMembers.members[1].user.id, {
        ...mockMembers.members[1],
        nickname: null,
      });
      members.set(mockMembers.members[2].user.id, {
        ...mockMembers.members[2],
        nickname: null,
      });

      const sortedMembers = service.sortMembers(members);

      const sortedKeys = sortedMembers.map((member) => member.user.id);
      expect(sortedKeys).toEqual([
        mockMembers.members[0].user.id,
        mockMembers.members[1].user.id,
        mockMembers.members[2].user.id,
      ]); // 1-0Nick, 1-1Nick, 1-2Nick
    });

    it('should return an empty collection when input is empty', () => {
      const members = new Collection<string, GuildMember>();

      const sortedMembers = service.sortMembers(members);

      expect(sortedMembers.size).toBe(0);
    });
  });

  describe('generateReport', () => {
    it('should generate a report for purgable members by game and no game role', async () => {
      const totalMembers = 10;
      const totalBots = 2;
      const totalHumans = 8;
      const inGracePeriod = 0;
      const inactive = 1;
      const purgables: PurgableMemberList = {
        purgableMembers: new Collection<string, GuildMember>(),
        purgableByGame: {
          ps2: new Collection<string, GuildMember>(),
          ps2Verified: new Collection<string, GuildMember>(),
          foxhole: new Collection<string, GuildMember>(),
          albion: new Collection<string, GuildMember>(),
          albionRegistered: new Collection<string, GuildMember>(),
        },
        totalMembers,
        totalBots,
        totalHumans,
        inGracePeriod,
        inactive,
      };

      const mockGuildMember = (id: string, displayName: string) =>
        ({
          user: { id },
          displayName,
          joinedTimestamp: Date.now() - 1000000,
        }) as GuildMember;

      purgables.purgableByGame.ps2.set('1', mockGuildMember('1', 'User1'));
      purgables.purgableByGame.foxhole.set('2', mockGuildMember('2', 'User2'));
      purgables.purgableByGame.albion.set('2', mockGuildMember('3', 'User3'));
      purgables.purgableMembers.set('1', mockGuildMember('1', 'User1'));
      purgables.purgableMembers.set('2', mockGuildMember('2', 'User2'));
      purgables.purgableMembers.set('3', mockGuildMember('3', 'User3'));

      await service.generateReport(purgables, mockMessage);

      expect(mockMessage.channel.send).toHaveBeenCalledWith('### PS2');
      expect(mockMessage.channel.send).toHaveBeenCalledWith('### FOXHOLE');
      expect(mockMessage.channel.send).toHaveBeenCalledWith('### ALBION');
      expect(mockMessage.channel.send).toHaveBeenCalledWith('### No game role');
      expect(mockDiscordService.batchSend).toHaveBeenCalledTimes(4);

      const percent = Math.floor(
        (purgables.purgableMembers.size / purgables.totalHumans) * 100,
      ).toFixed(1);
      const inactivePercent = Math.floor(
        (purgables.inactive / purgables.purgableMembers.size) * 100,
      ).toFixed(1);
      const nonOnboarders = purgables.purgableMembers.size - purgables.inactive;
      const nonOnboardersPercent = Math.floor(
        (nonOnboarders / purgables.purgableMembers.size) * 100,
      ).toFixed(1);

      const expectedPurgeReport = `## 📜 Purge Report
- Total members at start of purge: **${totalMembers}**
- Total members at end of purge: **${totalMembers - purgables.purgableMembers.size}**
- Total humans at start of purge: **${totalHumans}**
- Total humans at end of purge: **${totalHumans - purgables.purgableMembers.size}**
- ⏳ Members in 1 week grace period: **${inGracePeriod}**
- 👞 Humans purged: **${purgables.purgableMembers.size}** (${percent}% of total humans on server)
- 😴 Humans inactive: **${purgables.inactive}** (${inactivePercent}% of purged)
- 🫨 Humans who failed to onboard: **${nonOnboarders}** (${nonOnboardersPercent}% of purged)`;
      const expectedGameReport = `## Game stats
Note, these numbers will not add up to total numbers, as a member can be in multiple games.
- Total PS2 purged: **${purgables.purgableByGame.ps2.size}**
- Total PS2 verified purged: **${purgables.purgableByGame.ps2Verified.size}**
- Total Foxhole purged: **${purgables.purgableByGame.foxhole.size}**
- Total Albion purged: **${purgables.purgableByGame.albion.size}**
- Total Albion Registered purged: **${purgables.purgableByGame.albionRegistered.size}**`;

      expect(mockMessage.channel.send).toHaveBeenCalledWith(
        expectedPurgeReport,
      );
      expect(mockMessage.channel.send).toHaveBeenCalledWith(expectedGameReport);
    });
  });
});

function createMockMember(
  options: MockMemberOptions,
  returnCount: number,
  key = 1,
): { members: any[]; actives: any[] } {
  // Create a hash of the options object values so the users will always be unique

  const members: any[] = [];
  const actives: any[] = [];
  let count = 0;
  while (count < returnCount) {
    const nickname = options.nickname || `${key}-${count.toString()}Nick`;
    const member = {
      joinedTimestamp: options.withinGrace ? Date.now() - 100000 : 1234567890,
      user: {
        id: `${key}-${count.toString()}`,
        bot: options.isBot,
        username: `${key}-${count.toString()}User`,
      },
      nickname,
      roles: {
        cache: {
          has: () => options.roles.onboarded,
        },
      },
      fetch: jest.fn(),
    };
    member.fetch = jest.fn().mockResolvedValue(member);
    members.push(member);

    if (options.active) {
      actives.push(member);
    }

    count++;
  }
  return { members, actives };
}

function createMockActiveRecords(
  count: number,
  isInactive = false,
): ActivityEntity[] {
  const actives = [];
  let i = 0;

  const activeDate = new Date();

  if (isInactive) {
    activeDate.setDate(activeDate.getDate() - 100);
  }
  else {
    activeDate.setDate(activeDate.getDate() - 1);
  }

  while (i < count) {
    actives.push({
      discordId: `${i}`,
      discordNickname: `${i}Nick`,
      lastActivity: activeDate,
    });
    i++;
  }
  return actives;
}
