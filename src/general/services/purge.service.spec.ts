/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PurgeService } from './purge.service';
import { TestBootstrapper } from '../../test.bootstrapper';
import { Collection, GuildMember } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { DatabaseService } from '../../database/services/database.service';

describe('PurgeService', () => {
  let service: PurgeService;
  let mockMessage: any;
  let mockRole: any;
  let discordService: DiscordService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        PurgeService,
        ConfigService,
        {
          provide: DiscordService,
          useValue: {
            kickMember: jest.fn(),
          },
        },
        {
          provide: DatabaseService,
          useValue: {
            getActives: jest.fn().mockImplementation(() => {
              return [];
            }),
          },
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<PurgeService>(PurgeService);
    discordService = moduleRef.get<DiscordService>(DiscordService);
    discordService.deleteMessage = jest.fn().mockReturnValue(() => true);

    mockMessage = TestBootstrapper.getMockDiscordMessage();
    mockRole = TestBootstrapper.getMockDiscordRole('123');

    mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
      id: '123',
    });
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

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
          username: `${key}-${count.toString()}-user`,
        },
        nickname: `${key}-${count.toString()}-nick`,
        roles: {
          cache: {
            has: () => options.roles.onboarded,
          },
        },
      };
      members.push(member);

      if (options.active) {
        actives.push(member);
      }

      count++;
    }
    return { members, actives };
  }

  const inGrace = 5;
  const purgable = 23;
  const botSize = 13;
  const generatedData = {
    ...createMockMember({
      isBot: false,
      roles: { onboarded: false },
      withinGrace: true,
      active: true,
    }, inGrace, 1), // NOT purged, within grace
    ...createMockMember({
      isBot: false,
      roles: { onboarded: true },
      withinGrace: false,
      active: true,
    }, 50, 2), // NOT purged, has role
    ...createMockMember({
      isBot: false,
      roles: { onboarded: false },
      withinGrace: false,
      active: true,
    }, purgable, 3), // PURGED, out of grace, no role
    ...createMockMember({
      isBot: true,
      roles: { onboarded: false },
      withinGrace: false,
      active: true,
    }, botSize, 4), // NOT purged, bots
    ...createMockMember({
      isBot: false,
      roles: { onboarded: true },
      withinGrace: true,
      active: false,
    }, inGrace, 1), // Onboarded member who went inactive
  };

  // Get the .members and .actives from the generated data into seperate arrays
  const members = [...generatedData.members];

  console.log(members);

  // Your test case with dynamic member creation
  it('should properly calculate purgable members, bot count and human count', async () => {
    mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
      id: '123',
    });

    // Mock fetch implementation
    mockMessage.guild.members.fetch = jest.fn().mockImplementation(() => {
      return {
        size: members.length,
        sort: () => members,
        filter: (callback) => new Collection(members.filter(callback).map(member => [member.user.id, member])),
        values: () => members.map(member => {
          return {
            ...member,
            fetch: jest.fn().mockResolvedValue(member),
            kick: jest.fn().mockImplementation(() => true),
          };
        }),
      };
    });

    const result = await service.getPurgableMembers(mockMessage as any);

    expect(result.purgableMembers.size).toBe(purgable);
    expect(result.totalMembers).toBe(members.length);
    expect(result.totalBots).toBe(botSize);
    expect(result.totalHumans).toBe(members.length - botSize);
    expect(result.inGracePeriod).toBe(inGrace);
  });

  describe('kickPurgableMembers', () => {
    // it('should call the kick function for each purgable member', async () => {
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
    //     false,
    //   );
    //
    //   expect(discordService.kickMember).toHaveBeenCalledTimes(purgables.length);
    //   expect(discordService.deleteMessage).toHaveBeenCalledTimes(1);
    //   expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${purgables.length} purgable members...`);
    //   expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
    //   expect(mockMessage.channel.send).toHaveBeenCalledWith(`- 🥾 Kicked ${purgables[0].nickname} (${purgables[0].user.id})\n`);
    //   expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [1/1] (100%)');
    //   expect(mockMessage.channel.send).toHaveBeenCalledWith(`**${purgables.length}** members kicked.`);
    //   expect(mockMessage.channel.send).toHaveBeenCalledTimes(5);
    // });

//     it('should call the kick function for each purgable member more than batch limit', async () => {
//       const purgables = createMockMember({
//         isBot: false,
//         roles: { onboarded: false },
//         withinGrace: false,
//         active: true,
//
//       }, 6);
//
//       await service.kickPurgableMembers(
//         mockMessage as any,
//         new Collection(purgables.map(member => [member.user.id, member])),
//         false,
//       );
//
//       expect(discordService.kickMember).toHaveBeenCalledTimes(purgables.length);
//       expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${purgables.length} purgable members...`);
//       expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
//       expect(mockMessage.channel.send).toHaveBeenCalledWith(`- 🥾 Kicked 1-0-nick (1-0)
// - 🥾 Kicked 1-1-nick (1-1)
// - 🥾 Kicked 1-2-nick (1-2)
// - 🥾 Kicked 1-3-nick (1-3)
// - 🥾 Kicked 1-4-nick (1-4)
// `);
//       expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [5/6] (83%)');
//       expect(mockMessage.channel.send).toHaveBeenCalledWith('- 🥾 Kicked 1-5-nick (1-5)\n');
//       expect(mockMessage.channel.send).toHaveBeenCalledWith('🫰 Kicking progress: [6/6] (100%)');
//       expect(mockMessage.channel.send).toHaveBeenCalledWith(`**${purgables.length}** members kicked.`);
//     });
//
//     it('should NOT call the kick function for each purgable member for a DRY RUN', async () => {
//       const purgables = createMockMember({
//         isBot: false,
//         roles: { onboarded: false },
//         withinGrace: false,
//         active: true,
//       }, 1);
//
//       await service.kickPurgableMembers(
//         mockMessage as any,
//         new Collection(purgables.map(member => [member.user.id, member])),
//         true,
//       );
//
//       expect(discordService.kickMember).toHaveBeenCalledTimes(0);
//       expect(mockMessage.channel.send).toHaveBeenCalledWith(`Kicking ${purgables.length} purgable members...`);
//       expect(mockMessage.channel.send).toHaveBeenCalledWith('Kicking started...');
//       expect(mockMessage.channel.send).toHaveBeenCalledWith(`- [DRY RUN] 🥾 Kicked ${purgables[0].nickname} (${purgables[0].user.id})\n`);
//       expect(mockMessage.channel.send).toHaveBeenCalledWith('[DRY RUN] 🫰 Kicking progress: [1/1] (100%)');
//       expect(mockMessage.channel.send).toHaveBeenCalledWith(`[DRY RUN] **${purgables.length}** members kicked.`);
//     });
//   });
//
//   describe('isPurgable', () => {
//     it('should correctly mark someone as NOT purgable if they are active and HAVE been onboarded', async () => {
//       const mockMember = createMockMember({
//         isBot: false,
//         roles: { onboarded: true },
//         withinGrace: false,
//         active: true,
//       }, 1);
//
//       const activeMembers = new Collection<string, GuildMember>();
//       activeMembers.set(mockMember[0].user.id, mockMember[0]);
//
//       const result = service.isPurgable(mockMember[0], activeMembers, mockRole);
//
//       expect(result).toBe(false);
//     });
//   });
});
