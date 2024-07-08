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

  describe('getPurgableMembers', () => {
    it('should properly calculate purgable members and all other metrics', async () => {
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

  // describe('kickPurgableMembers', () => {
  //   it('should call the kick function for each purgable member', async () => {
  //     const purgables = createMockMember({
  //       isBot: false,
  //       roles: { onboarded: false },
  //       withinGrace: false,
  //       active: true,
  //     }, 1);
  //
  //     await service.kickPurgableMembers(
  //       mockMessage as any,
  //       new Collection(purgables.map(member => [member.user.id, member])),
  //       false,
  //     );
  //
  //     expect(discordService.kickMember).toHaveBeenCalledTimes(purgables.length);
  //     expect(discordService.deleteMessage).toHaveBeenCalledTimes(1);
  //     expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${purgables.length} purgable members...`);
  //     expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
  //     expect(mockMessage.channel.send).toHaveBeenCalledWith(`- 🥾 Kicked ${purgables[0].nickname} (${purgables[0].user.id})\n`);
  //     expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [1/1] (100%)');
  //     expect(mockMessage.channel.send).toHaveBeenCalledWith(`**${purgables.length}** members purged.`);
  //     expect(mockMessage.channel.send).toHaveBeenCalledTimes(5);
  //   });
  //
  // //     it('should call the kick function for each purgable member more than batch limit', async () => {
  // //       const purgables = createMockMember({
  // //         isBot: false,
  // //         roles: { onboarded: false },
  // //         withinGrace: false,
  // //         active: true,
  // //
  // //       }, 6);
  // //
  // //       await service.kickPurgableMembers(
  // //         mockMessage as any,
  // //         new Collection(purgables.map(member => [member.user.id, member])),
  // //         false,
  // //       );
  // //
  // //       expect(discordService.kickMember).toHaveBeenCalledTimes(purgables.length);
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${purgables.length} purgable members...`);
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith(`- 🥾 Kicked 1-0-nick (1-0)
  // // - 🥾 Kicked 1-1-nick (1-1)
  // // - 🥾 Kicked 1-2-nick (1-2)
  // // - 🥾 Kicked 1-3-nick (1-3)
  // // - 🥾 Kicked 1-4-nick (1-4)
  // // `);
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [5/6] (83%)');
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith('- 🥾 Kicked 1-5-nick (1-5)\n');
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [6/6] (100%)');
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith(`**${purgables.length}** members purged.`);
  // //     });
  // //
  // //     it('should NOT call the kick function for each purgable member for a DRY RUN', async () => {
  // //       const purgables = createMockMember({
  // //         isBot: false,
  // //         roles: { onboarded: false },
  // //         withinGrace: false,
  // //         active: true,
  // //       }, 1);
  // //
  // //       await service.kickPurgableMembers(
  // //         mockMessage as any,
  // //         new Collection(purgables.map(member => [member.user.id, member])),
  // //         true,
  // //       );
  // //
  // //       expect(discordService.kickMember).toHaveBeenCalledTimes(0);
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${purgables.length} purgable members...`);
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith(`- [DRY RUN] 🥾 Kicked ${purgables[0].nickname} (${purgables[0].user.id})\n`);
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith('[DRY RUN] 🫰 Kicking progress: [1/1] (100%)');
  // //       expect(mockMessage.channel.send).toHaveBeenCalledWith(`[DRY RUN] **${purgables.length}** members kicked.`);
  // //     });
  // });

  // it('should NOT call the kick function for each purgable member for a DRY RUN', async () => {
  //   // Mock forEach implementation
  //   const purgables = createMockMember({
  //     isBot: false,
  //     roles: { onboarded: false },
  //     withinGrace: false,
  //     active: true,
  //   }, 1);
  //
  //   await service.kickPurgableMembers(
  //     mockMessage as any,
  //     new Collection(purgables.map(member => [member.user.id, member])),
  //     true,
  //   );
  //
  //   expect(discordService.kickMember).toHaveBeenCalledTimes(0);
  //   expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${purgables.length} purgable members...`);
  //   expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
  //   expect(mockMessage.channel.send).toHaveBeenCalledWith(`- [DRY RUN] 🥾 Kicked ${purgables[0].nickname} (${purgables[0].user.id})\n`);
  //   expect(mockMessage.channel.send).toHaveBeenCalledWith('[DRY RUN] 🫰 Kicking progress: [1/1] (100%)');
  //   expect(mockMessage.channel.send).toHaveBeenCalledWith(`[DRY RUN] **${purgables.length}** members purged.`);
  // });

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
