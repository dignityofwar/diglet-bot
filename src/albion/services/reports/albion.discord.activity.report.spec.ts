import { TestBootstrapper } from '../../../test.bootstrapper';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlbionDiscordActivity, AlbionDiscordActivityReport } from './albion.discord.activity.report';
import { DiscordService } from '../../../discord/discord.service';
import { EntityRepository } from '@mikro-orm/core';
import { AlbionRegistrationsEntity } from '../../../database/entities/albion.registrations.entity';
import { ActivityEntity } from '../../../database/entities/activity.entity';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { GuildTextBasedChannel, Interaction } from 'discord.js';

const mockChannelId = '1234567890';
const mockDiscordUser = TestBootstrapper.getMockDiscordUser();
const mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(mockChannelId, mockDiscordUser)[0] as unknown as Interaction;

// I feel dirty for this
const mockChannel = mockDiscordInteraction.channel as unknown as GuildTextBasedChannel;

describe('AlbionDiscordActivityReport', () => {
  let service: AlbionDiscordActivityReport;
  let mockDiscordService: DiscordService;
  let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;
  let mockActivityRepository : EntityRepository<ActivityEntity>;

  beforeEach(async () => {
    mockAlbionRegistrationsRepository = TestBootstrapper.getMockEntityRepo();
    mockActivityRepository = TestBootstrapper.getMockEntityRepo();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionDiscordActivityReport,
        ConfigService,
        ReflectMetadataProvider,
        {
          provide: DiscordService,
          useValue: {
            batchSend: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AlbionRegistrationsEntity),
          useValue: mockAlbionRegistrationsRepository,
        },
        {
          provide: getRepositoryToken(ActivityEntity),
          useValue: mockActivityRepository,
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<AlbionDiscordActivityReport>(AlbionDiscordActivityReport);
    mockDiscordService = moduleRef.get<DiscordService>(DiscordService);

    TestBootstrapper.setupLoggerSpies(service, AlbionDiscordActivityReport.name);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('runReport', () => {
    beforeEach(() => {
      service.getMemberActivity = jest.fn().mockResolvedValue([]);
      service.reportStart = jest.fn();
      service.reportMembers = jest.fn();
    });
    it('should run the report and transmit the results to the interaction channel', async () => {
      const mockRegistrants = mockRegistrantData(5);
      const mockHydratedMembers = mockHydrateMemberActivity(mockRegistrants);
      mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValue(mockRegistrants);
      service.getMemberActivity = jest.fn().mockResolvedValue(mockHydratedMembers);

      await service.runReport(mockDiscordInteraction);

      expect(service['logger'].log).toHaveBeenCalledWith(`Running Albion Discord Activity Report requested by ${mockDiscordInteraction.user.displayName}...`);
      expect(mockChannel.send).toHaveBeenCalledWith('Running Albion Discord Activity Report...');
      expect(service.getMemberActivity).toHaveBeenCalledWith(mockRegistrants);
      expect(service.reportStart).toHaveBeenCalledWith(mockHydratedMembers, mockChannel);
      expect(service.reportMembers).toHaveBeenCalledWith(mockHydratedMembers, mockChannel);
      expect(mockChannel.send).toHaveBeenCalledWith('Report complete!');
    });

    it('should report back there are no registrants if none were found', async () => {
      mockAlbionRegistrationsRepository.findAll = jest.fn().mockResolvedValue([]);
      await service.runReport(mockDiscordInteraction);

      expect(service['logger'].warn).toHaveBeenCalledWith('No registrants found!');
      expect(mockChannel.send).toHaveBeenCalledWith('No registrants found!');
      expect(service.getMemberActivity).toHaveBeenCalledTimes(0);
    });
  });

  describe('hydrateMemberActivity', () => {
    it('should build member data from one registrant', async () => {
      const mockRegistrantsSingle = mockRegistrantData(1);
      const activityDate = new Date();
      const expectedResult = [{
        characterName: mockRegistrantsSingle[0].characterName,
        discordId: mockRegistrantsSingle[0].discordId,
        lastActive: activityDate,
        registered: mockRegistrantsSingle[0].createdAt,
      }];
      mockActivityRepository.findOne = jest.fn().mockResolvedValue({
        discordId: mockRegistrantsSingle[0].discordId,
        lastActivity: activityDate,
      });

      const result = await service.getMemberActivity(mockRegistrantsSingle);

      expect(result).toEqual(expectedResult);
    });

    it('should build member data correctly', async () => {
      const mockRegistrants = mockRegistrantData(50);
      const mockMemberActivity = mockHydrateMemberActivity(mockRegistrants);

      // Mock the repository to return controlled data
      mockActivityRepository.findOne = jest.fn().mockImplementation(({ discordId }) => {
        // eslint-disable-next-line max-nested-callbacks,no-shadow
        const activity = mockMemberActivity.find(activity => activity.discordId === discordId);
        return Promise.resolve(activity);
      });

      const result = await service.getMemberActivity(mockRegistrants);

      expect(service['logger'].log).toHaveBeenCalledWith('Building member data');

      const mockResultData = [];
      mockRegistrants.forEach((registrant, index) => {
        const activity = mockMemberActivity[index];
        mockResultData.push({
          characterName: registrant.characterName,
          discordId: registrant.discordId,
          lastActivity: activity.lastActivity,
          registered: registrant.createdAt,
        });
      });

      expect(result).toEqual(mockResultData);
    });

    it('should log a warning if no activity record is found', async () => {
      const mockRegistrants = mockRegistrantData(3);

      // Mock the repository to return null for one of the registrants
      mockActivityRepository.findOne = jest.fn()
        .mockImplementation(({ discordId }) => {
          return Promise.resolve(discordId === '1234567891' ? null : { lastActivity: new Date() });
        });

      const result = await service.getMemberActivity(mockRegistrants);

      expect(service['logger'].warn).toHaveBeenCalledWith('No activity record found for 1234567891');
      expect(result).toHaveLength(2);
    });

  });

  describe('reportStart', () => {

  });

  describe('reportMembers', () => {

  });
});

function mockRegistrantData(count: number) {
  const mockData = [];
  for (let i = 0; i < count; i++) {
    // Random days between 35 and 60 for registration
    const randomRegDays = Math.floor(Math.random() * 25) + 35;
    const regDate = new Date();
    regDate.setDate(regDate.getDate() - randomRegDays);

    mockData.push({
      characterName: `TestCharacter${i}`,
      discordId: `123456789${i}`,
      createdAt: regDate,
    });
  }

  return mockData;
}

function mockHydrateMemberActivity(registrants: AlbionRegistrationsEntity[]): AlbionDiscordActivity[] {
  const mockData = [];
  for (const registrant of registrants) {
    // Random days between 1 and 30 for activity
    const activeDate = new Date();
    const randomActiveDays = Math.floor(Math.random() * 30) + 1;
    activeDate.setDate(activeDate.getDate() - randomActiveDays);

    const record: AlbionDiscordActivity = {
      characterName: registrant.characterName,
      discordId: registrant.discordId,
      lastActivity: activeDate,
      registered: registrant.createdAt,
    };
    mockData.push(record);
  }

  return mockData;
}
