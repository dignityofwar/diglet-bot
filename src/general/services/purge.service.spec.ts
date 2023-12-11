/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PurgeService } from './purge.service';
import { TestBootstrapper } from '../../test.bootstrapper';
import { Collection } from 'discord.js';

describe('PurgeService', () => {
  let service: PurgeService;
  let mockMessage: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PurgeService, ConfigService],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<PurgeService>(PurgeService);

    mockMessage = TestBootstrapper.getMockDiscordMessage();
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
    hasRole: boolean;
    withinGrace: boolean;
  }
  function createMockMember(options: MockMemberOptions, returnCount) {
    // Create a hash of the options object values so the users will always be unique
    const hash = Object.values(options).join('-');

    const returnArray = [];
    let count = 0;
    while (count < returnCount) {
      returnArray.push({
        joinedTimestamp: options.withinGrace ? Date.now() - 100000 : 1234567890,
        user: {
          id: `${hash}-${count.toString()}`,
          bot: options.isBot,
        },
        roles: {
          cache: {
            has: () => options.hasRole,
          },
        },
      });
      count++;
    }
    return returnArray;
  }

  const inGrace = 5;
  const purgable = 23;
  const botSize = 13;
  const members = [
    ...createMockMember({ isBot: false, hasRole: false, withinGrace: true }, inGrace), // NOT purged, within grace
    ...createMockMember({ isBot: false, hasRole: true, withinGrace: false }, 50), // NOT purged, has role
    ...createMockMember({ isBot: false, hasRole: false, withinGrace: false }, purgable), // PURGED, out of grace, no role
    ...createMockMember({ isBot: true, hasRole: false, withinGrace: false }, botSize), // NOT purged, bots
  ];

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

  it('should call the kick function for each purgable member', async () => {
    mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
      id: '123',
    });

    // Mock forEach implementation
    mockMessage.guild.members.cache.forEach = jest.fn().mockImplementation((callback) => {
      members.forEach(member => callback(member));
    });

  });
});
