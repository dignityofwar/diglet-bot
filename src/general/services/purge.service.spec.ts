/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PurgeService } from './purge.service';
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
  }
  withinGrace: boolean;
  active: boolean
}

describe('PurgeService', () => {
  let service: PurgeService;
  let activityService: ActivityService;
  let mockMessage: any;
  let discordService: DiscordService;
  const mockActivityEntity = {
    discordId: '123456',
    discordNickname: 'testuser',
  } as ActivityEntity;
  const mockActivityRepository = TestBootstrapper.getMockRepositoryInjected(mockActivityEntity);
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
  mockRolePS2.name = 'Planetside2';
  const mockRolePS2Verified = TestBootstrapper.getMockDiscordRole('234567890');
  mockRolePS2Verified.name = 'PS2Verified';
  const mockRoleFoxhole = TestBootstrapper.getMockDiscordRole('345678901');
  mockRoleFoxhole.name = 'Foxhole';
  const mockRoleAlbion = TestBootstrapper.getMockDiscordRole('456789012');
  mockRoleAlbion.name = 'Albion';
  const mockRoleAlbionUSRegistered = TestBootstrapper.getMockDiscordRole('567890123');
  mockRoleAlbionUSRegistered.name = 'AlbionUSRegistered';
  const mockRoleAlbionEURegistered = TestBootstrapper.getMockDiscordRole('678901234');
  const devUserId = TestBootstrapper.mockConfig.discord.devUserId;

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
    discordService = moduleRef.get<DiscordService>(DiscordService);
    activityService = moduleRef.get<ActivityService>(ActivityService);

    mockMessage = TestBootstrapper.getMockDiscordMessage();

    mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
      id: '123',
    });
    // Mock fetch implementation
    mockMessage.guild.members.fetch = jest.fn().mockImplementation(() => {
      return {
        size: generatedMembers.size,
        sort: () => generatedMembers,
        filter: (callback: (value: GuildMember, key: string, collection: Collection<string, GuildMember>) => key is string) => new Collection(generatedMembers.filter(callback).map(member => [member.user.id, member])),
        values: () => generatedMembers.map(member => {
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
      createMockMember({
        isBot: false,
        roles: { onboarded: false },
        withinGrace: false,
        active: true,
      }, purgableCount, 0), // Purgable, out of grace, no role
      createMockMember({
        isBot: false,
        roles: { onboarded: true },
        withinGrace: false,
        active: false,
      }, inactiveCount, 1), // Purgable, inactive member
      createMockMember({
        isBot: false,
        roles: { onboarded: true },
        withinGrace: false,
        active: true,
      }, validCount, 2), // NOT purgable, active and normal member
      createMockMember({
        isBot: false,
        roles: { onboarded: false },
        withinGrace: true,
        active: true,
      }, inGraceCount, 3), // NOT purgable, within grace
      createMockMember({
        isBot: true,
        roles: { onboarded: false },
        withinGrace: false,
        active: true,
      }, botCount, 4), // Not purgable, bot
    ];

    // Collect all .members from each created member object
    const generatedMembersArray = membersData.flatMap(member => member.members || []);

    // Populate the members Collection
    generatedMembersArray.forEach(member => {
      generatedMembers.set(member.user.id, member);
    });

    // Populate the activeMembers collection
    membersData.forEach(member => {
      if (member.actives) {
        member.actives.forEach(active => {
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

  describe('preflightChecks', () => {
    it('should return the roles in order', async () => {
      mockRoleAlbionEURegistered.name = 'AlbionEURegistered';

      mockMessage.guild.roles.cache.find = jest.fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(mockRoleFoxhole)
        .mockReturnValueOnce(mockRoleAlbion)
        .mockReturnValueOnce(mockRoleAlbionUSRegistered)
        .mockReturnValueOnce(mockRoleAlbionEURegistered);

      const result = service.preflightChecks(mockMessage as any);

      expect(result.onboardedRole).toBe(mockRoleOnboarded);
      expect(result.ps2Role).toBe(mockRolePS2);
      expect(result.ps2VerifiedRole).toBe(mockRolePS2Verified);
      expect(result.foxholeRole).toBe(mockRoleFoxhole);
      expect(result.albionRole).toBe(mockRoleAlbion);
      expect(result.albionUSRegistered).toBe(mockRoleAlbionUSRegistered);
      expect(result.albionEURegistered).toBe(mockRoleAlbionEURegistered);
    });

    it('should throw an error if the Onboarded role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest.fn()
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(`Could not find Onboarded role! Pinging Bot Dev <@${devUserId}>!`);
    });
    it('should throw an error if the Planetside2 role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest.fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(`Could not find Planetside2 role! Pinging Bot Dev <@${devUserId}>!`);
    });
    it('should throw an error if the PS2/Verified role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest.fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(`Could not find PS2/Verified role! Pinging Bot Dev <@${devUserId}>!`);
    });
    it('should throw an error if the Foxhole role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest.fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(`Could not find Foxhole role! Pinging Bot Dev <@${devUserId}>!`);
    });
    it('should throw an error if the Albion Online role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest.fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(mockRoleFoxhole)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(`Could not find Albion Online role! Pinging Bot Dev <@${devUserId}>!`);
    });
    it('should throw an error if the Albion Online registered US role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest.fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(mockRoleFoxhole)
        .mockReturnValueOnce(mockRoleAlbion)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(`Could not find Albion Online registered role(s)! Pinging Bot Dev <@${devUserId}>!`);
    });

    it('should throw an error if the Albion Online registered EU role does not exist', async () => {
      mockMessage.guild.roles.cache.find = jest.fn()
        .mockReturnValueOnce(mockRoleOnboarded)
        .mockReturnValueOnce(mockRolePS2)
        .mockReturnValueOnce(mockRolePS2Verified)
        .mockReturnValueOnce(mockRoleFoxhole)
        .mockReturnValueOnce(mockRoleAlbion)
        .mockReturnValueOnce(mockRoleAlbionUSRegistered)
        .mockReturnValueOnce(null);

      expect(() => service.preflightChecks(mockMessage as any)).toThrow(`Could not find Albion Online registered role(s)! Pinging Bot Dev <@${devUserId}>!`);
    });
  });

  describe('getPurgableMembers', () => {
    it('should handle preflightChecks errors', async () => {
      service.preflightChecks = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      expect(await service.getPurgableMembers(mockMessage as any, true)).toBe(undefined);

      expect(mockMessage.channel.send).toHaveBeenCalledWith('Preflight checks failed! Err: Test error');
    });
    it('should handle errors when fetching members list from Discord', async () => {
      service.resolveActiveMembers = jest.fn().mockResolvedValue(new Collection(activeMembers));
      mockMessage.guild.members.fetch = jest.fn().mockRejectedValue(new Error('Test error'));
      expect(await service.getPurgableMembers(mockMessage as any, true)).toBe(undefined);

      expect(mockMessage.channel.send).toHaveBeenCalledWith('Error fetching Discord server members. Err: Test error');
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
    //   // Mock the message.channel.send method
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

      service.resolveActiveMembers = jest.fn().mockResolvedValue(new Collection(activeMembers));

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
      discordService.getGuildMember = jest.fn().mockResolvedValue({});

      const result = await service.resolveActiveMembers(mockMessage, false);

      expect(result.size).toBe(10);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('Getting active Discord members [0/10] (0%)...');
      expect(newStatusMessage.edit).toHaveBeenCalledWith('Getting active Discord members [10/10] (100%)...');
      expect(mockMessage.channel.send).toHaveBeenCalledWith('Detected **10** active members!');
      expect(newStatusMessage.delete).toHaveBeenCalled();
    });
    it('should handle server leavers', async () => {
      const mockActives = createMockActiveRecords(4);

      mockActivityRepository.find = jest.fn().mockResolvedValue(mockActives);
      discordService.getGuildMember = jest.fn()
        .mockResolvedValueOnce({})
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({});

      const result = await service.resolveActiveMembers(mockMessage, false);

      expect(result.size).toBe(2);
      expect(activityService.removeActivityRecord).toHaveBeenCalledWith(mockActives[1], false);
      expect(activityService.removeActivityRecord).toHaveBeenCalledWith(mockActives[2], false);
      expect(activityService.removeActivityRecord).not.toHaveBeenCalledWith(mockActives[0], false);
      expect(activityService.removeActivityRecord).toHaveBeenCalledTimes(2);
    });
  });

  describe('isPurgable', () => {
    it('should not mark someone as purgable if they pass all the criteria', async () => {
      const mockMembers = createMockMember({
        isBot: false,
        roles: { onboarded: true },
        withinGrace: false,
        active: true,
      }, 1);

      activeMembers.set(mockMembers.members[0].user.id, mockMembers.actives[0]);

      expect(service.isPurgable(
        mockMembers.members[0],
        activeMembers,
        mockRole
      )).toBe(false);
    });
    it('should not mark a member as purgable if they are a bot', async () => {
      const mockMembers = createMockMember({
        isBot: true,
        roles: { onboarded: false },
        withinGrace: false,
        active: true,
      }, 1);

      expect(service.isPurgable(
        mockMembers.members[0],
        activeMembers,
        mockRole
      )).toBe(false);
    });
    it('should not mark a member as purgable if they are freshly joined and not onboarded', async () => {
      const mockMembers = createMockMember({
        isBot: false,
        roles: { onboarded: false },
        withinGrace: true,
        active: true,
      }, 1);

      expect(service.isPurgable(
        mockMembers.members[0],
        activeMembers,
        mockRole
      )).toBe(false);
    });
    it('should mark someone as purgable if they are inactive', async () => {
      const mockMembers = createMockMember({
        isBot: false,
        roles: { onboarded: true },
        withinGrace: false,
        active: false,
      }, 1);

      expect(service.isPurgable(
        mockMembers.members[0],
        activeMembers,
        mockRole
      )).toBe(true);
    });
    it('should mark someone as purgable if they are not onboarded and out of grace period', async () => {
      const mockMembers = createMockMember({
        isBot: false,
        roles: { onboarded: false },
        withinGrace: false,
        active: true,
      }, 1);

      expect(service.isPurgable(
        mockMembers.members[0],
        activeMembers,
        mockRole
      )).toBe(true);
    });
  });

  describe('kickPurgableMembers', () => {
    it('should call the kick function for one purgable member', async () => {
      const purgables = createMockMember({
        isBot: false,
        roles: { onboarded: false },
        withinGrace: false,
        active: true,
      }, 1);

      const purgableMembers = new Collection(purgables.members.map(member => [member.user.id, member]));

      await service.kickPurgableMembers(
        mockMessage as any,
        purgableMembers,
        false,
      );

      const count = purgableMembers.size;
      const date = new Date().toLocaleString();

      expect(discordService.kickMember).toHaveBeenCalledWith(purgables.members[0], mockMessage, `Automatic purge: ${date}`);
      expect(discordService.deleteMessage).toHaveBeenCalledTimes(1);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${count} purgable members...`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`- 🥾 Kicked ${purgables.members[0].nickname} (${purgables.members[0].user.id})\n`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [1/1] (100%)');
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`**${count}** members purged.`);
      expect(mockMessage.channel.send).toHaveBeenCalledTimes(5);
    });

    it('should call the kick function for multiple purgable members', async () => {
      const purgables = createMockMember({
        isBot: false,
        roles: { onboarded: false },
        withinGrace: false,
        active: true,
      }, 5);

      const purgableMembers = new Collection(purgables.members.map(member => [member.user.id, member]));

      await service.kickPurgableMembers(
        mockMessage as any,
        purgableMembers,
        false,
      );

      const count = purgableMembers.size;

      expect(discordService.kickMember).toHaveBeenCalledTimes(count);
      expect(discordService.deleteMessage).toHaveBeenCalledTimes(1);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${count} purgable members...`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`- 🥾 Kicked 1-0Nick (1-0)
- 🥾 Kicked 1-1Nick (1-1)
- 🥾 Kicked 1-2Nick (1-2)
- 🥾 Kicked 1-3Nick (1-3)
- 🥾 Kicked 1-4Nick (1-4)
`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [5/5] (100%)');
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`**${count}** members purged.`);
      expect(mockMessage.channel.send).toHaveBeenCalledTimes(5);
    });

    it('should call the kick function for each purgable member more than batch limit', async () => {
      const purgables = createMockMember({
        isBot: false,
        roles: { onboarded: false },
        withinGrace: false,
        active: true,
      }, 6);

      const purgableMembers = new Collection(purgables.members.map(member => [member.user.id, member]));

      await service.kickPurgableMembers(
        mockMessage as any,
        purgableMembers,
        false,
      );

      const count = purgableMembers.size;

      expect(discordService.kickMember).toHaveBeenCalledTimes(count);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${count} purgable members...`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`- 🥾 Kicked 1-0Nick (1-0)
- 🥾 Kicked 1-1Nick (1-1)
- 🥾 Kicked 1-2Nick (1-2)
- 🥾 Kicked 1-3Nick (1-3)
- 🥾 Kicked 1-4Nick (1-4)
`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [5/6] (83%)');
      expect(mockMessage.channel.send).toHaveBeenCalledWith('- 🥾 Kicked 1-5Nick (1-5)\n');
      expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [6/6] (100%)');
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`**${count}** members purged.`);
    });

    it('should NOT call the kick function for each purgable member for a DRY RUN', async () => {
      const purgables = createMockMember({
        isBot: false,
        roles: { onboarded: false },
        withinGrace: false,
        active: true,
      }, 1);

      const purgableMembers = new Collection(purgables.members.map(member => [member.user.id, member]));

      await service.kickPurgableMembers(
        mockMessage as any,
        purgableMembers,
        true,
      );

      const count = purgableMembers.size;

      expect(discordService.kickMember).toHaveBeenCalledTimes(0);
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${count} purgable members...`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`- [DRY RUN] 🥾 Kicked ${purgables.members[0].nickname} (${purgables.members[0].user.id})\n`);
      expect(mockMessage.channel.send).toHaveBeenCalledWith('[DRY RUN] 🫰 Kicking progress: [1/1] (100%)');
      expect(mockMessage.channel.send).toHaveBeenCalledWith(`[DRY RUN] **${count}** members purged.`);
    });
  });
});

function createMockMember(options: MockMemberOptions, returnCount: number, key = 1): { members: any[], actives: any[]} {
  // Create a hash of the options object values so the users will always be unique

  const members: any[] = [];
  const actives: any[] = [];
  let count = 0;
  while (count < returnCount) {
    const member = {
      joinedTimestamp: options.withinGrace ? Date.now() - 100000 : 1234567890,
      user: {
        id: `${key}-${count.toString()}`,
        bot: options.isBot,
        username: `${key}-${count.toString()}User`,
      },
      nickname: `${key}-${count.toString()}Nick`,
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

function createMockActiveRecords(count: number, isInactive = false): ActivityEntity[] {
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
