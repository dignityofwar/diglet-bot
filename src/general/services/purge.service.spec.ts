/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PurgeService } from './purge.service';
import { TestBootstrapper } from '../../test.bootstrapper';

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
  function createMockMember(isBot, hasRole, returnCount) {
    const returnArray = [];
    let count = 0;
    while (count < returnCount) {
      returnArray.push({
        user: {
          bot: isBot,
        },
        roles: {
          cache: {
            has: () => hasRole,
          },
        },
      });
      count++;
    }
    return returnArray;
  }

  const members = [
    ...createMockMember(false, true, 10), // 10 humans with role
    ...createMockMember(false, false, 20), // 20 humans without role
    ...createMockMember(true, false, 5), // 5 bots without role
  ];

  // Your test case with dynamic member creation
  it('should properly calculate purgable members, bot count and human count', async () => {
    mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
      id: '123',
    });

    // Mock forEach implementation
    mockMessage.guild.members.cache.forEach = jest.fn().mockImplementation((callback) => {
      members.forEach(member => callback(member));
    });

    const result = await service.getPurgableMembers(mockMessage as any);

    expect(result.purgableMembers.length).toBe(20);
    expect(result.totalMembers).toBe(35);
    expect(result.totalBots).toBe(5);
    expect(result.totalHumans).toBe(30);
  });
});
