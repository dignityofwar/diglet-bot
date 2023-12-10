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
  function createMockMember(isBot, hasRole) {
    return {
      user: {
        bot: isBot,
      },
      roles: {
        cache: {
          has: jest.fn().mockReturnValue(hasRole),
        },
      },
    };
  }

  // Your test case with dynamic member creation
  it('should properly calculate bots and humans without the onboarded role', async () => {
    mockMessage.guild.roles.cache.find = jest.fn().mockReturnValue({
      id: '123',
    });

    // Define your members here
    const members = [
      ...Array.from({ length: 3 }, () => createMockMember(false, false)), // 3 humans without role
      ...Array.from({ length: 2 }, () => createMockMember(true, false)), // 2 bots without role
      createMockMember(true, false), // 1 bot
      ...Array.from({ length: 30 }, () => createMockMember(false, true)), // 30 humans with role
    ];

    // Mock forEach implementation
    mockMessage.guild.members.cache.forEach = jest.fn().mockImplementation((callback) => {
      members.forEach(member => callback(member));
    });

    const result = await service.getPurgableMembers(mockMessage as any);

    expect(result.length).toBe(3); // Adjust expectation based on your mock data
  });
});
