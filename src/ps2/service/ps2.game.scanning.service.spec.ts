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
const mockDevUserId = TestBootstrapper.mockConfig.discord.devUserId;

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

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('Gathering 2 characters from Census...');
      expect(result).toEqual([outfitMembers[0], outfitMembers[1]]);
    });

    it('should handle Census being on its arse, filtering out bad data', async () => {
      const outfitMembers = [
        TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId),
        TestBootstrapper.getMockPS2Character(`${mockCharacterId}2`, mockOutfitId),
      ];

      mockCensusService.getCharacterById = jest.fn()
        .mockResolvedValueOnce(outfitMembers[0])
        .mockImplementationOnce(() => { throw new CensusServerError('Census is dead m9'); });

      const result = await service.gatherCharacters(outfitMembers, mockDiscordMessage);

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith('Gathering 2 characters from Census...');
      expect(result).toEqual([outfitMembers[0]]);
    });

    it('should handle characters that don\'t exist', async () => {
      const error = ('Character with ID **12345** does not exist.');
      mockCensusService.getCharacterById = jest.fn().mockImplementation(() => { throw new CensusNotFoundResponse(error); });

      const mockPS2Entity = TestBootstrapper.getMockPS2MemberEntity();

      const result = await service.gatherCharacters(
        [mockPS2Entity],
        mockDiscordMessage
      );

      expect(mockDiscordMessage.channel.send).toBeCalledWith(`❌ ${error}`);
      expect(result).toEqual([]);
    });

    it('should handle Census being on its arse', async () => {
      const error = 'Census is dead m9';
      mockCensusService.getCharacterById = jest.fn().mockImplementation(() => { throw new CensusServerError(error); });

      const result = await service.gatherCharacters([TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId)], mockDiscordMessage);

      expect(mockDiscordMessage.channel.send).toBeCalledWith(`❌ ${error}`);
      expect(result).toEqual([]);
    });

    it('should handle partial character returns', async () => {
      const error = ('Character with ID **12345** does not exist.');
      const mockCharacter = TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId);
      mockCensusService.getCharacterById = jest.fn()
        .mockImplementationOnce(() => { throw new CensusNotFoundResponse(error); })
        .mockResolvedValueOnce(mockCharacter);

      const mockPS2Entity = TestBootstrapper.getMockPS2MemberEntity();

      const result = await service.gatherCharacters(
        [mockPS2Entity, mockPS2Entity],
        mockDiscordMessage
      );

      expect(mockDiscordMessage.channel.send).toBeCalledWith(`❌ ${error}`);
      expect(result).toEqual([mockCharacter]);
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

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`❌ Character data for ID **${mockPS2MemberEntity.characterId}** did not exist when attempting to verify their membership. Skipping. Pinging <@474839309484>!`);
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

    it('should still take action when a character is missing and notify the dev', async () => {
      const mockPS2MemberEntity2 = TestBootstrapper.getMockPS2MemberEntity(`${mockCharacterId}2`);
      const mockPS2Character2 = TestBootstrapper.getMockPS2Character(`${mockCharacterId}2`, '676879886756');
      const mockDiscordMember = TestBootstrapper.getMockDiscordUser();
      mockDiscordMessage.guild.members.fetch = jest.fn().mockResolvedValue(mockDiscordMember);

      await service.verifyMembership(
        [mockPS2Character2],
        [mockPS2MemberEntity, mockPS2MemberEntity2],
        mockDiscordMessage,
        false
      );

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`❌ Character data for ID **${mockPS2MemberEntity.characterId}** did not exist when attempting to verify their membership. Skipping. Pinging <@${mockDevUserId}>!`);
      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).toHaveBeenCalledWith(
        mockPS2MemberEntity2,
        mockPS2Character2,
        mockDiscordMember,
        mockDiscordMessage,
        false
      );
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
