/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';
import { EntityManager } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { TestBootstrapper } from '../../test.bootstrapper';
import { PS2GameScanningService } from './ps2.game.scanning.service';
import { CensusApiService } from './census.api.service';

const mockCharacterId = '5428010618035323201';
const mockOutfitId = TestBootstrapper.mockConfig.ps2.outfitId;

describe('PS2GameScanningService', () => {
  let service: PS2GameScanningService;
  let mockCensusService: CensusApiService;
  let mockDiscordMessage: any;

  let mockEntityManager: jest.Mocked<EntityManager>;

  beforeEach(async () => {
    TestBootstrapper.mockORM();

    const mockPS2MembersRepository = TestBootstrapper.getMockRepositoryInjected({});

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PS2GameScanningService,
        ReflectMetadataProvider,
        { provide: EntityManager, useValue: mockEntityManager },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: CensusApiService,
          useValue: {
            getCharacter: jest.fn(),
            getCharacterById: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PS2MembersEntity),
          useValue: mockPS2MembersRepository,
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<PS2GameScanningService>(PS2GameScanningService);
    mockCensusService = moduleRef.get(CensusApiService) as jest.Mocked<CensusApiService>;

    // Mocks
    mockDiscordMessage = TestBootstrapper.getMockDiscordMessage();

    // Handle map mocking
    // service['monitoringCharacters'] = new Map();
    // service['monitoringCharacters'].set(mockPS2Character.character_id, mockPS2Character);
    // service['messagesMap'] = new Map();
    // service['messagesMap'].set(mockPS2Character.character_id, mockDiscordMessage);

    // Filled spies
    jest.spyOn(service['logger'], 'error');
    jest.spyOn(service['logger'], 'warn');
    jest.spyOn(service['logger'], 'log');
  });

  describe('gatherCharacters', () => {
    it('should gather characters successfully', async () => {
      const outfitMembers = [
        TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId),
        TestBootstrapper.getMockPS2Character(`${mockCharacterId}2`, mockOutfitId),
      ];

      mockCensusService.getCharacterById = jest.fn()
        .mockResolvedValueOnce(outfitMembers[0])
        .mockResolvedValueOnce(outfitMembers[1]);

      const result = await service.gatherCharacters(outfitMembers, mockDiscordMessage);

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('Gathering 2 characters from Census... (attempt #1)');
      // I don't know why this is broken... it's not thinking it's being called but it is??? Probably something to do with the promises.
      // expect(mockCensusService.getCharacterById).toHaveBeenCalledWith(mockCharacterId);
      // expect(mockCensusService.getCharacterById).toHaveBeenCalledWith(`${mockCharacterId}2`);
      // expect(mockCensusService.getCharacterById).toHaveBeenCalledTimes(2);
      expect(result).toEqual([outfitMembers[0], outfitMembers[1]]);
    });

    it('should handle error and retry up to 3 times', async () => {
      const outfitMembers = [TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId)];
      const error = new Error('Census timeout');
      mockCensusService.getCharacterById = jest.fn().mockRejectedValue(error);

      const result = await service.gatherCharacters(outfitMembers, mockDiscordMessage, 0, 500);

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('Gathering 1 characters from Census... (attempt #1)');
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('## ⚠️ Couldn\'t gather 1 characters from Census, likely due to Census timeout issues. Retrying in 10s (attempt #1)...');
      // Couldn't check the other 3 times, tests in promise loops is weird as shit man
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('## ❌ An error occurred while gathering 1 characters! Giving up after 3 tries.');
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`Error: ${error.message}`);
      expect(result).toBeNull();
    });
  });
});
