import { Test } from '@nestjs/testing';
import { GuildMember } from 'discord.js';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { DatabaseService } from './database.service';
import { ActivityEntity } from '../entities/activity.entity';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('DatabaseService', () => {
  let service: DatabaseService;
  let mockActivityRepository: EntityRepository<ActivityEntity>;

  const mockMember = {
    id: '123456',
    displayName: 'testuser',
    nickname: null,
    user: { username: 'testuser' },
  } as unknown as GuildMember;

  const mockActivityEntity = {
    discordId: '123456',
    discordNickname: 'testuser',
  } as ActivityEntity;

  beforeEach(async () => {
    mockActivityRepository = TestBootstrapper.getMockRepositoryInjected(mockActivityEntity);

    const moduleRef = await Test.createTestingModule({
      providers: [
        DatabaseService,
        {
          provide: getRepositoryToken(ActivityEntity),
          useValue: mockActivityRepository,
        },
      ],
    }).compile();

    service = moduleRef.get<DatabaseService>(DatabaseService);
    mockActivityRepository = moduleRef.get<EntityRepository<ActivityEntity>>(getRepositoryToken(ActivityEntity));

    jest.spyOn(service['logger'], 'verbose');
    jest.spyOn(service['logger'], 'error');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('updateActivity', () => {
    it('should update the timestamp of an existing record', async () => {
      mockActivityRepository.findOne = jest.fn().mockResolvedValue(mockActivityEntity);
      const entityManager = mockActivityRepository.getEntityManager();

      await service.updateActivity(mockMember);

      expect(mockActivityRepository.findOne).toHaveBeenCalledWith({ discordId: mockMember.id });
      // The explicit persist matters: v7 does not change-track scalars, so without it the flush is a no-op.
      expect(entityManager.persist).toHaveBeenCalledWith(mockActivityEntity);
      expect(entityManager.flush).toHaveBeenCalled();
      expect(mockActivityEntity.lastActivity).toBeInstanceOf(Date);
      expect(service['logger'].verbose).toHaveBeenCalledWith(`Updated activity for ${mockMember.id}`);
    });

    it('should create a record when the member has none', async () => {
      mockActivityRepository.findOne = jest.fn().mockResolvedValue(null);
      const entityManager = mockActivityRepository.getEntityManager();

      await service.updateActivity(mockMember);

      expect(entityManager.persist).toHaveBeenCalledWith(expect.objectContaining({
        discordId: mockMember.id,
        discordNickname: mockMember.displayName,
      }));
      expect(entityManager.flush).toHaveBeenCalled();
    });

    it('should log an error when the flush fails', async () => {
      mockActivityRepository.findOne = jest.fn().mockResolvedValue(mockActivityEntity);
      const entityManager = mockActivityRepository.getEntityManager();
      entityManager.flush = jest.fn().mockRejectedValue(new Error('Database went boom!'));

      await service.updateActivity(mockMember);

      expect(service['logger'].error).toHaveBeenCalledWith(`Error updating activity for ${mockMember.id}: Database went boom!`);
    });
  });
});
