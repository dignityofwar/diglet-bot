/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionApiService } from './albion.api.service';
import AlbionAxiosFactory from '../factories/albion.axios.factory';

describe('AlbionApiService', () => {
  let service: AlbionApiService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [AlbionApiService],
    }).compile();

    service = moduleRef.get<AlbionApiService>(AlbionApiService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should return an error if no player exists', async () => {
    const searchResponse = {
      data: {
        guilds: [],
        players: [],
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn().mockResolvedValue(searchResponse),
    } as any);

    await expect(service.getCharacter('who.dis'))
      .rejects
      .toThrowError('Character does not exist. Please ensure you have supplied your exact name.');
  });

  it('should return a character based on exact match amongst partial matches', async () => {
    const searchResponse = {
      data: {
        guilds: [],
        players: [
          {
            'Id': 'hd8zVXIjRc6lnb_1FYIgpw',
            'Name': 'Maelstrome',
          },
          {
            'Id': 'tOuPzciNRAKEZLEbnkXjJw',
            'Name': 'Maelstrome26',
          },
        ],
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn().mockResolvedValue(searchResponse),
    } as any);

    await expect(service.getCharacterId('Maelstrome'))
      .resolves
      .toBe('hd8zVXIjRc6lnb_1FYIgpw');
  });

  it('should throw an error if multiple characters are found with the exact same name', async () => {
    const characterName = 'NightRaven2511';
    const searchResponse = {
      data: {
        guilds: [],
        players: [
          {
            'Id': 'xNyVq16xTCKyPKCPqboe4w',
            'Name': characterName,
            'GuildId': '',
            'GuildName': '',
          },
          {
            'Id': '2obpVpJrRfqa26SIXdXK4A',
            'Name': characterName,
            'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
            'GuildName': 'DIG - Dignity of War',
          },
        ],
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn().mockResolvedValue(searchResponse),
    } as any);

    await expect(service.getCharacter(characterName))
      .rejects
      .toThrowError(`Multiple characters with exact name "${characterName}" found. Please contact the Guild Masters as manual intervention is required.`);
  });
});
