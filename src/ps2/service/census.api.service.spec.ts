import { CensusApiService } from './census.api.service';
import CensusAxiosFactory from '../factories/census.axios.factory';
import { Test, TestingModule } from '@nestjs/testing';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { ConfigService } from '@nestjs/config';
import { TestBootstrapper } from '../../test.bootstrapper';
import { CensusRetriesError } from '../interfaces/CensusRetriesError';
import { CensusServerError } from '../interfaces/CensusServerError';
import { AxiosInstance } from 'axios';

describe('CensusApiService', () => {
  let service: CensusApiService;
  let moduleRef: TestingModule;
  let mockCensusAxiosFactory: CensusAxiosFactory;
  let mockClient: AxiosInstance;
  const mockUrl = 'http://mock.url';

  beforeEach(async () => {
    moduleRef = await Test.createTestingModule({
      providers: [
        CensusApiService,
        ReflectMetadataProvider,
        {
          provide: CensusAxiosFactory,
          useValue: {
            createClient: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);
    service = moduleRef.get<CensusApiService>(CensusApiService);
    mockCensusAxiosFactory = moduleRef.get(CensusAxiosFactory);

    // Provide a mocked client
    const axios = {
      get: jest.fn(),
    } as never;
    mockCensusAxiosFactory.createClient = jest.fn().mockReturnValue(axios);
    mockClient = mockCensusAxiosFactory.createClient();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('onModuleInit', () => {
    it('should crash upon missing service ID', async () => {
      TestBootstrapper.setupConfig(moduleRef, {
        ps2: {
          censusServiceId: '',
        },
      });
      await expect(service.onModuleInit()).rejects.toThrow('PS2_CENSUS_SERVICE_ID is not defined.');
    });

    it('should throw upon census being unavailable or errors', async () => {
      const error = 'Census responded with an error: "Service Unavailable"';
      service.getCharacter = jest.fn().mockRejectedValue(new Error(error));

      await expect(service.onModuleInit()).rejects.toThrow(error);
    });
  });

  describe('sendRequest', () => {
    it('should return a successful request', async () => {
      const mockResponse = { data: 'mock data' };
      mockClient.get = jest.fn().mockResolvedValue(mockResponse);

      const response = await service.sendRequest(mockUrl);

      // Test that the data key is stripped
      expect(response).toBe('mock data');
      expect(mockClient.get).toHaveBeenCalledWith(mockUrl);
    });

    it('should throw when no response data was returned', async () => {
      mockClient.get = jest.fn().mockResolvedValue({});

      await expect(service.sendRequest(mockUrl)).rejects.toThrow('No data was received from Census!');

      expect(mockClient.get).toHaveBeenCalledWith(mockUrl);
    });

    it('should retry upon a Census service error message', async () => {
      const mockResponse = { data: 'mock data' };
      mockClient.get = jest.fn().mockResolvedValueOnce({ data: { error: 'Service Unavailable' } }).mockResolvedValue(mockResponse);

      const response = await service.sendRequest(mockUrl);

      expect(response).toBe('mock data');
      expect(mockClient.get).toHaveBeenCalledWith(mockUrl);
      expect(mockClient.get).toHaveBeenCalledTimes(2);
    });

    it('should retry upon a Census "errorMessage"', async () => {
      const mockResponse = { data: 'mock data' };
      mockClient.get = jest.fn().mockResolvedValueOnce({ data: { errorMessage: 'Some Census Error' } }).mockResolvedValue(mockResponse);

      const response = await service.sendRequest(mockUrl);

      expect(response).toBe('mock data');
      expect(mockClient.get).toHaveBeenCalledWith(mockUrl);
      expect(mockClient.get).toHaveBeenCalledTimes(2);
    });

    it('should retry upon a Census error, and throw an error when retries are exceeded', async () => {
      const lastError = 'Service Unavailable';
      mockClient.get = jest.fn().mockResolvedValue({ data: { error: lastError } });

      await expect(service.sendRequest(mockUrl)).rejects.toThrow(`Failed to perform request to Census after 3 retries. Final error: "Census responded with an error: "${lastError}""`);

      expect(mockClient.get).toHaveBeenCalledWith(mockUrl);
      expect(mockClient.get).toHaveBeenCalledTimes(3);
    });

    it('should retry upon a Census errorMessage, and throw an error when retries are exceeded', async () => {
      const lastError = 'Some error from Census';
      mockClient.get = jest.fn().mockResolvedValue({ data: { errorMessage: lastError } });

      await expect(service.sendRequest(mockUrl)).rejects.toThrow(`Failed to perform request to Census after 3 retries. Final error: "Census responded with an error: "${lastError}""`);

      expect(mockClient.get).toHaveBeenCalledWith(mockUrl);
      expect(mockClient.get).toHaveBeenCalledTimes(3);
    });
  });

  describe('getCharacter', () => {
    it('should return a character, and also returns outfit details', async () => {
      const mockCharacterId = '542576768678787801';
      const mockOutfitId = '454544545769833';
      const mockCharacter = TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId);
      service.sendRequest = jest.fn().mockResolvedValue({ character_list: [mockCharacter] });

      const character = await service.getCharacter('Maelstrome26');

      expect(character).toBeDefined();
      expect(character.character_id).toBe(mockCharacterId);
      expect(character.outfit_info).toBeDefined();
      expect(character.outfit_info.outfit_id).toBe(mockOutfitId);
    });

    it('should throw an error if a character doesn\'t exist', async () => {
      const name = 'IDoNotExist101010101010101';
      service.sendRequest = jest.fn().mockResolvedValue({ character_list: [] });

      await expect(service.getCharacter(name)).rejects.toThrow(`Character \`${name}\` does not exist. Please ensure you have spelt it correctly.`);
    });

    it('should throw an error if a character search exhausts its retries', async () => {
      const name = 'IDoNotExist101010101010101';
      service.sendRequest = jest.fn().mockImplementation(() => {
        throw new CensusRetriesError('Census Retries exhausted.');
      });

      await expect(service.getCharacter(name)).rejects.toThrow('Census Retries exhausted.');
    });
  });
  describe('getCharacterById', () => {
    it('should return a character with the same ID', async () => {
      const mockCharacterId = '5428010618035323201';
      const mockOutfitId = '454544545769833';
      const mockCharacter = TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId);
      service.sendRequest = jest.fn().mockResolvedValue({ character_list: [mockCharacter] });

      const character = await service.getCharacterById(mockCharacterId);

      expect(character).toBeDefined();
      expect(character.character_id).toBe(mockCharacterId);
      expect(character.outfit_info.outfit_id).toBe(mockOutfitId);
    });

    it('should throw an error if a character doesn\'t exist (by ID)', async () => {
      const id = '12343435465464646454';

      service.sendRequest = jest.fn().mockResolvedValue({ character_list: [] });
      await expect(service.getCharacterById(id)).rejects.toThrow(`Character with ID **${id}** does not exist.`);
    });

    it('should throw an error when Census falls on its arse', async () => {
      service.sendRequest = jest.fn().mockImplementation(() => {
        throw new CensusServerError('Census errored.');
      });

      await expect(service.getCharacterById('123456')).rejects.toThrow('Census Errored when fetching character with ID **123456**. Err: Census errored.');
    });
  });

  describe('getOutfit', () => {
    it('should return an outfit', async () => {
      const mockOutfitId = '454544545769833';
      const mockOutfit = TestBootstrapper.getMockPS2Outfit(mockOutfitId);
      service.sendRequest = jest.fn().mockResolvedValue({ outfit_list: [mockOutfit] });

      const outfit = await service.getOutfit(mockOutfitId);

      expect(outfit).toBeDefined();
      expect(outfit.outfit_id).toBe(mockOutfitId);
    });

    it('should throw an error when the outfit does not exist', async () => {
      const outfitId = '123434354654';
      service.sendRequest = jest.fn().mockResolvedValue({ outfit_list: [] });

      await expect(service.getOutfit(outfitId)).rejects.toThrow(`Outfit with ID **${outfitId}** does not exist.`);
    });

    it('should throw an error when Census falls on its arse', async () => {
      service.sendRequest = jest.fn().mockImplementation(() => {
        throw new CensusServerError('Census errored.');
      });

      await expect(service.getOutfit('123456')).rejects.toThrow('Census Errored when fetching outfit with ID **123456**. Err: Census errored.');
    });
  });
});
