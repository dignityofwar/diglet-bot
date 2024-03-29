/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionApiService } from './albion.api.service';
import AlbionAxiosFactory from '../factories/albion.axios.factory';
import { ConfigService } from '@nestjs/config';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionPlayerInterface, AlbionPlayersResponseInterface } from '../interfaces/albion.api.interfaces';

const mockGuildId = TestBootstrapper.mockConfig.albion.guildId;

describe('AlbionApiService', () => {
  let service: AlbionApiService;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionApiService,
        ConfigService,
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);
    service = moduleRef.get<AlbionApiService>(AlbionApiService);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
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
      .toThrowError('character **who.dis** does not seem to exist. Please ensure you have supplied your **exact** name (case sensitive) and your character is older than 48 hours.');
  });

  it('should return a character based on exact match amongst partial matches', async () => {
    const properResult = {
      'Id': 'hd8zVXIjRc6lnb_1FYIgpw',
      'Name': 'Maelstrome',
    };
    const searchResponse = {
      data: {
        guilds: [],
        players: [
          properResult,
          {
            'Id': 'tOuPzciNRAKEZLEbnkXjJw',
            'Name': 'Maelstrome26',
          },
        ],
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn().mockResolvedValueOnce(searchResponse).mockResolvedValueOnce({
        data: properResult,
      }),
    } as any);

    await expect(service.getCharacter('Maelstrome'))
      .resolves
      .toStrictEqual(properResult);
  });

  it('should return a character based on an ID', async () => {
    const id = 'hd8zVXIjRc6lnb_1FYIgpw';
    const properResult = {
      'Id': id,
      'Name': 'Maelstrome',
    };
    const response = {
      data: properResult,
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn().mockResolvedValueOnce(response),
    } as any);

    await expect(service.getCharacterById(id))
      .resolves
      .toStrictEqual(properResult);
  });

  it('should throw an error when the API returns a different character ID than expected', async () => {
    const id = 'hd8zVXIjRc6lnb_1FYIgpw';
    const properResult = {
      'Id': id,
      'Name': 'Maelstrome',
    };
    const searchResponse = {
      data: {
        guilds: [],
        players: [properResult],
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn().mockResolvedValueOnce(searchResponse).mockResolvedValueOnce({
        data: { Id: '1234567', Name: 'Maelstrome' },
      }),
    } as any);

    await expect(service.getCharacter('Maelstrome'))
      .rejects
      .toThrowError(`character ID \`${id}\` does not match API response consistently. Pinging <@${TestBootstrapper.mockConfig.discord.devUserId}>!`);
  });

  it('should handle a character having duplicates, as long as only one of them is in the guild', async () => {
    const characterName = 'NightRaven2511';
    const properResult = {
      'Id': '2obpVpJrRfqa26SIXdXK4A',
      'Name': characterName,
      'GuildId': mockGuildId,
      'GuildName': 'DIG - Dignity of War',
    };

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
          properResult,
        ],
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn()
        .mockResolvedValueOnce(searchResponse)
        .mockResolvedValueOnce({ data: properResult }),
    } as any);

    await expect(service.getCharacter(characterName))
      .resolves
      .toStrictEqual(properResult);
  });
  it('should throw error when multiple characters are found and none are in the guild', async () => {
    const characterName = 'NightRaven2511';
    const properResult = {
      'Id': '2obpVpJrRfqa26SIXdXK4A',
      'Name': characterName,
      'GuildId': '',
      'GuildName': '',
    };

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
          properResult,
        ],
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn()
        .mockResolvedValueOnce(searchResponse)
        .mockResolvedValueOnce({ data: properResult }),
    } as any);

    await expect(service.getCharacter(characterName))
      .rejects
      .toThrowError(`multiple characters for **${characterName}** were found, none of them are a guild member.`);
  });
  it('should throw error when multiple characters of the same name in the guild', async () => {
    const characterName = 'NightRaven2511';
    const properResult = {
      'Id': '2obpVpJrRfqa26SIXdXK4A',
      'Name': characterName,
      'GuildId': mockGuildId,
      'GuildName': 'DIG - Dignity of War',
    };
    const duplicate = {
      'Id': '33rfgegdDGDgfgffdfHHH',
      'Name': characterName,
      'GuildId': mockGuildId,
      'GuildName': 'DIG - Dignity of War',
    };

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
          properResult,
          duplicate,
        ],
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn()
        .mockResolvedValueOnce(searchResponse),
    } as any);

    await expect(service.getCharacter(characterName))
      .rejects
      .toThrowError(`multiple characters for **NightRaven2511** were found within the DIG guild. This is an unsupported use case for this registration system. Pinging <@${TestBootstrapper.mockConfig.discord.devUserId}>!`);
  });

  it('should return a character with all uppercase letters', async () => {
    const searchResponse = {
      data: {
        'guilds': [],
        'players': [
          {
            'Id': 'jTFos2u5QQ6OjhYV9C6DMw',
            'Name': 'R4L2E1',
            'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
            'GuildName': 'DIG - Dignity of War',
          },
        ],
      },
    };
    const playerResponse = {
      data: {
        'Id': 'jTFos2u5QQ6OjhYV9C6DMw',
        'Name': 'R4L2E1',
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
    };

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue({
      get: jest.fn()
        .mockResolvedValueOnce(searchResponse)
        .mockResolvedValueOnce(playerResponse),
    } as any);

    const result = await service.getCharacter('R4L2E1');
    expect(result.Name).toBe('R4L2E1');
  });

  it('should get all guild members', async () => {
    const guildId = 'complicatedGuildId';
    const mockMembers: AlbionPlayerInterface[] = [
      {
        'Id': Math.random().toString(36).substr(2, 10),
        'Name': Math.random().toString(36).substr(2, 10),
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
      {
        'Id': Math.random().toString(36).substr(2, 10),
        'Name': Math.random().toString(36).substr(2, 10),
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
      {
        'Id': Math.random().toString(36).substr(2, 10),
        'Name': Math.random().toString(36).substr(2, 10),
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
      {
        'Id': Math.random().toString(36).substr(2, 10),
        'Name': Math.random().toString(36).substr(2, 10),
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
    ] as any[];
    const mockResponse: AlbionPlayersResponseInterface = { data: mockMembers } as any;
    const mockRequest = { get: jest.fn().mockResolvedValue(mockResponse) } as any;

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiClient').mockReturnValue(mockRequest);

    const receivedMembers = await service.getAllGuildMembers(guildId);

    expect(receivedMembers).toEqual(mockMembers);
    expect(mockRequest.get).toBeCalledWith(`/guilds/${guildId}/members`);
  });
});
