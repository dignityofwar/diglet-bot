import { Test } from '@nestjs/testing';
import { GuildMember } from 'discord.js';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { GuildMemberEvents } from './guild.member.events';
import { ActivityEntity } from '../../database/entities/activity.entity';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('GuildMemberEvents', () => {
  let service: GuildMemberEvents;
  let mockActivityRepository: EntityRepository<ActivityEntity>;
  const mockActivityEntity = {
    discordId: '123456',
    discordNickname: 'testuser',
  } as ActivityEntity;

  beforeEach(async () => {
    mockActivityRepository =
      TestBootstrapper.getMockRepositoryInjected(mockActivityEntity);

    const moduleRef = await Test.createTestingModule({
      providers: [
        GuildMemberEvents,
        {
          provide: getRepositoryToken(ActivityEntity),
          useValue: mockActivityRepository,
        },
      ],
    }).compile();

    service = moduleRef.get<GuildMemberEvents>(GuildMemberEvents);
    mockActivityRepository = moduleRef.get<EntityRepository<ActivityEntity>>(
      getRepositoryToken(ActivityEntity),
    );

    // Filled spies
    jest.spyOn(service['logger'], 'error');
    jest.spyOn(service['logger'], 'warn');
    jest.spyOn(service['logger'], 'log');
    jest.spyOn(service['logger'], 'debug');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onGuildMemberRemove', () => {
    it('should do nothing if the member is a bot', async () => {
      const mockMember = {
        user: { bot: true },
      } as GuildMember;

      await service.onGuildMemberRemove(mockMember);

      expect(mockActivityRepository.findOne).not.toHaveBeenCalled();
      expect(
        mockActivityRepository.getEntityManager().removeAndFlush,
      ).not.toHaveBeenCalled();
      expect(service['logger'].debug).not.toHaveBeenCalled();
      expect(service['logger'].log).not.toHaveBeenCalled();
      expect(service['logger'].warn).not.toHaveBeenCalled();
    });

    it('should remove activity record if found', async () => {
      const mockMember = {
        user: { bot: false },
        id: '123',
        displayName: 'TestUser',
      } as GuildMember;

      const mockActivityRecord = {
        discordId: '123',
        discordNickname: 'TestUser',
      } as ActivityEntity;

      mockActivityRepository.findOne = jest
        .fn()
        .mockResolvedValue(mockActivityRecord);

      await service.onGuildMemberRemove(mockMember);

      expect(mockActivityRepository.findOne).toHaveBeenCalledWith({
        discordId: mockMember.id,
      });
      expect(service['logger'].debug).toHaveBeenCalledWith(
        `Member "${mockMember.displayName}" has left the server.`,
      );
      expect(
        mockActivityRepository.getEntityManager().removeAndFlush,
      ).toHaveBeenCalledWith(mockActivityRecord);
      expect(service['logger'].log).toHaveBeenCalledWith(
        `Removed activity record for leaver ${mockActivityRecord.discordNickname} (${mockActivityRecord.discordId})`,
      );
    });

    it('should log a warning if no activity record is found', async () => {
      const mockMember = {
        user: { bot: false },
        id: '123',
        displayName: 'TestUser',
      } as GuildMember;

      mockActivityRepository.findOne = jest.fn().mockResolvedValue(null);

      await service.onGuildMemberRemove(mockMember);

      expect(mockActivityRepository.findOne).toHaveBeenCalledWith({
        discordId: '123',
      });
      expect(
        mockActivityRepository.getEntityManager().removeAndFlush,
      ).not.toHaveBeenCalled();
      expect(service['logger'].debug).not.toHaveBeenCalled();
      expect(service['logger'].log).not.toHaveBeenCalled();
      expect(service['logger'].warn).toHaveBeenCalledWith(
        'No activity record was found for leaver TestUser (123), likely left immediately after joining.',
      );
    });
  });
});
