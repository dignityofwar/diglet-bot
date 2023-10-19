import { CensusApiService } from './census.api.service';
import CensusAxiosFactory from '../factories/census.axios.factory';
import { Test, TestingModule } from '@nestjs/testing';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { ConfigService } from '@nestjs/config';
import * as _ from 'lodash';

describe('CensusApiService', () => {
  let config: ConfigService;
  let service: CensusApiService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CensusApiService,
        ReflectMetadataProvider,
        CensusAxiosFactory,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();

    config = module.get<ConfigService>(ConfigService);
    service = module.get<CensusApiService>(CensusApiService);

    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        ps2: {
          censusServiceId: 'dignityofwar',
          censusTimeout: 10000,
        },
      };

      const result = _.get(data, key);

      if (!result) {
        throw new Error(`Unexpected config key: ${key}`);
      }

      return result;
    });

  });

  test('should be defined', () => {
    expect(service).toBeDefined();
  });

  test('init should crash upon missing service ID', async () => {
    jest.spyOn(config, 'get').mockReturnValue('');

    await expect(service.onModuleInit()).rejects.toThrowError('PS2_CENSUS_SERVICE_ID is not defined.');
  });

  test('init should throw upon census being unavailable or errors', async () => {
    jest.spyOn(service, 'getCharacter').mockRejectedValue(new Error('Census responded with an error: Service Unavailable'));

    await expect(service.onModuleInit()).rejects.toThrow('Census responded with an error: Service Unavailable');
  });

  // NOTE these actually make the request to the Census API, so they're slow / flaky
  try {
    test('should return a character, and also returns outfit details', async () => {
      const character = await service.getCharacter('Maelstrome26');

      expect(character).toBeDefined();
      expect(character.outfit_info).toBeDefined();
      expect(character.outfit_info.outfit_id).toBe('37509488620604883');
    }, 10000);
    test('should throw an error if a character doesn\'t exist', async () => {
      const name = 'IDoNotExist101010101010101';
      await expect(service.getCharacter(name)).rejects.toThrowError(`Character \`${name}\` does not exist. Please ensure you have spelt it correctly.`);
    }, 10000);
    test('should return a character, and also returns outfit details (by ID)', async () => {
      const character = await service.getCharacterById('5428010618035323201');

      expect(character).toBeDefined();
      expect(character.outfit_info).toBeDefined();
      expect(character.outfit_info.outfit_id).toBe('37509488620604883');
    }, 10000);
    test('should throw an error if a character doesn\'t exist (by ID)', async () => {
      const id = '12343435465464646454';
      await expect(service.getCharacterById(id)).rejects.toThrowError(`Character with ID **${id}** does not exist.`);
    }, 10000);
  }
  catch (e) {
    console.log('Flaky Census test failed, skipping.');
  }

  // Shits hard man
  // test('census requests should be retried', async () => {
  //   // Mock Axios client to reject every request.
  //   let axiosMock = {
  //     get: jest.fn().mockRejectedValue(new Error('Network error')),
  //   };
  //
  //   // Mock the factory, so we can inject the mocked Axios client.
  //   const censusAxiosFactory = new CensusAxiosFactory(config);
  //   jest.spyOn(censusAxiosFactory, 'createClient').mockReturnValue(axiosMock);
  //
  //
  //   service = new CensusApiService(censusAxiosFactory, config);
  //
  //   await expect(service.getCharacter('character?name.first_lower=iegehje46454')).resolves.toBeCalledTimes(3);
  // });
});
