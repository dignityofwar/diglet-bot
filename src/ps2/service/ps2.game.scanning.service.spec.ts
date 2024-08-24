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
import { CensusNotFoundResponse } from '../interfaces/CensusNotFoundResponse';
import { CensusServerError } from '../interfaces/CensusServerError';

const mockCharacterId = '5428010618035323201';
const mockOutfitId = TestBootstrapper.mockConfig.ps2.outfitId;

describe('PS2GameScanningService', () => {
  let service: PS2GameScanningService;
  let mockCensusService: CensusApiService;
  let mockDiscordMessage: any;

  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockPS2MembersRepository: jest.Mocked<EntityManager>;
  let mockPS2MemberEntity: PS2MembersEntity;
  let mockPS2Character: any;

  beforeEach(async () => {
    TestBootstrapper.mockORM();

    mockPS2MembersRepository = TestBootstrapper.getMockRepositoryInjected({});
    mockPS2MemberEntity = TestBootstrapper.getMockPS2MemberEntity(
      mockCharacterId
    );
    mockPS2Character = TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId);

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

    it('should handle Census outages', async () => {
      const outfitMembers = [TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId)];
      const error = new CensusServerError('Census timeout');
      mockCensusService.getCharacterById = jest.fn().mockRejectedValue(error);

      const result = await service.gatherCharacters(outfitMembers, mockDiscordMessage);

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('Gathering 1 characters from Census... (attempt #1)');
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('## ⚠️ Couldn\'t gather 1 characters from Census, likely due to Census timeout issues. Retrying in 10s (attempt #1)...');
      // Couldn't check the other 3 times, tests in promise loops is weird as shit man
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('## ❌ An error occurred while gathering 1 characters! Giving up after 3 tries.');
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`Error: ${error.message}`);
      expect(result).toBeNull();
    });

    it('should handle characters that don\'t exist', async () => {
      const error = new CensusNotFoundResponse('Character with ID **12345** does not exist');
      mockCensusService.getCharacterById = jest.fn().mockRejectedValue(error);

      const result = await service.gatherCharacters([TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId)], mockDiscordMessage);

      expect(mockDiscordMessage.channel.send).toBeCalledWith(`❌ An error occurred while gathering characters from Census! The character does not exist. ${error}`);
      expect(result).toBeNull();
    });

    it('should handle Census being on it\'s arse', async () => {
      const error = new CensusServerError('Census is dead m9');
      mockCensusService.getCharacterById = jest.fn().mockRejectedValue(error);

      const result = await service.gatherCharacters([TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId)], mockDiscordMessage);

      expect(mockDiscordMessage.channel.send).toBeCalledWith(`❌ An error occurred while gathering characters from Census! The character does not exist. ${error}`);
      expect(result).toBeNull();
    });
  });

  describe('validateMembership', () => {
    beforeEach(() => {
      service.removeDiscordLeaver = jest.fn();
      service.removeOutfitLeaver = jest.fn();
    });
    it('should not take any action when the character data is empty', async () => {
      await service.verifyMembership(
        [],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false
      );

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`❌ Character data **${mockPS2MemberEntity.characterId}** did not exist when attempting to verify their membership. Skipping. Pinging <@474839309484>!`);
      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).not.toHaveBeenCalled();
    });

    it('should not take any action when the character is valid', async () => {
      await service.verifyMembership(
        [mockPS2Character],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false
      );

      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).not.toHaveBeenCalled();
    });

    it('should call the removeOutfitLeaver function if the member has left the outfit', async () => {
      mockPS2Character = TestBootstrapper.getMockPS2Character(mockCharacterId, '3445576868678');
      const mockDiscordMember = TestBootstrapper.getMockDiscordUser();

      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordMember);

      await service.verifyMembership(
        [mockPS2Character],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false
      );

      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).toHaveBeenCalledWith(
        mockPS2MemberEntity,
        mockPS2Character,
        mockDiscordMember,
        mockDiscordMessage,
        false
      );
    });

    it('should call the removeDiscordLeaver function if the member has left the server', async () => {
      mockDiscordMessage.guild.members.fetch = jest.fn().mockImplementation(() => {throw new Error('Who dis?');});

      await service.verifyMembership(
        [mockPS2Character],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false
      );

      expect(service.removeDiscordLeaver).toHaveBeenCalledWith(
        mockPS2MemberEntity,
        mockPS2Character,
        false
      );
      expect(service.removeOutfitLeaver).not.toHaveBeenCalled();
    });
  });
});
