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
});
