/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionApiService } from './albion.api.service';
import AlbionAxiosFactory from '../factories/albion.axios.factory';
import { ConfigService } from '@nestjs/config';
import { TestBootstrapper } from '../../test.bootstrapper';
import {
  AlbionApiEndpoint,
  AlbionPlayerInterface,
  AlbionPlayersResponseInterface,
  AlbionServer,
} from '../interfaces/albion.api.interfaces';

const mockGuildId = TestBootstrapper.mockConfig.albion.guildIdUS;

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

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue({
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn().mockResolvedValue(searchResponse),
    } as any);

    await expect(service.getCharacter('who.dis', AlbionServer.AMERICAS))
      .rejects
      .toThrowError('Character **who.dis** does not seem to exist on the Americas server. Please ensure: \n1. You\'ve supplied your **exact** character name (case sensitive).\n2. You\'ve chosen the correct Albion server.\n3. Your character is older than 48 hours.');
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

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue({
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn().mockResolvedValueOnce(searchResponse).mockResolvedValueOnce({
        data: properResult,
      }),
    } as any);

    await expect(service.getCharacter('Maelstrome', AlbionServer.AMERICAS))
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

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue({
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn().mockResolvedValueOnce(response),
    } as any);

    await expect(service.getCharacterById(id, AlbionServer.AMERICAS))
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

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue({
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn().mockResolvedValueOnce(searchResponse).mockResolvedValueOnce({
        data: { Id: '1234567', Name: 'Maelstrome' },
      }),
    } as any);

    await expect(service.getCharacter('Maelstrome', AlbionServer.AMERICAS))
      .rejects
      .toThrowError(`Character ID \`${id}\` does not match API response consistently. Pinging <@${TestBootstrapper.mockConfig.discord.devUserId}>!`);
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

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue({
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn()
        .mockResolvedValueOnce(searchResponse)
        .mockResolvedValueOnce({ data: properResult }),
    } as any);

    await expect(service.getCharacter(characterName, AlbionServer.AMERICAS))
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

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue({
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn()
        .mockResolvedValueOnce(searchResponse)
        .mockResolvedValueOnce({ data: properResult }),
    } as any);

    await expect(service.getCharacter(characterName, AlbionServer.AMERICAS))
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

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue({
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn()
        .mockResolvedValueOnce(searchResponse),
    } as any);

    await expect(service.getCharacter(characterName, AlbionServer.AMERICAS))
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

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue({
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn()
        .mockResolvedValueOnce(searchResponse)
        .mockResolvedValueOnce(playerResponse),
    } as any);

    const result = await service.getCharacter('R4L2E1', AlbionServer.AMERICAS);
    expect(result.Name).toBe('R4L2E1');
  });

  it('should get all guild members', async () => {
    const guildId = 'complicatedGuildId';
    const mockMembers: AlbionPlayerInterface[] = [
      {
        'Id': Math.random().toString(36).substring(2, 10),
        'Name': Math.random().toString(36).substring(2, 10),
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
      {
        'Id': Math.random().toString(36).substring(2, 10),
        'Name': Math.random().toString(36).substring(2, 10),
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
      {
        'Id': Math.random().toString(36).substring(2, 10),
        'Name': Math.random().toString(36).substring(2, 10),
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
      {
        'Id': Math.random().toString(36).substring(2, 10),
        'Name': Math.random().toString(36).substring(2, 10),
        'GuildId': 'btPZRoLvTUqLC7URnDRgSQ',
        'GuildName': 'DIG - Dignity of War',
      },
    ] as any[];
    const mockResponse: AlbionPlayersResponseInterface = { data: mockMembers } as any;
    const mockRequest = {
      defaults: {
        baseURL: AlbionApiEndpoint.ALBION_AMERICAS,
      },
      get: jest.fn().mockResolvedValue(mockResponse),
    } as any;

    jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiAmericasClient').mockReturnValue(mockRequest);

    const receivedMembers = await service.getAllGuildMembers(guildId, AlbionServer.AMERICAS);

    expect(receivedMembers).toEqual(mockMembers);
    expect(mockRequest.get).toBeCalledWith(`/guilds/${guildId}/members`);
  });

  describe('Europe', () => {
    it('should properly return a character using expected client generated by createAlbionApiEuropeClient', async () => {
      const id = 'clhoV9OdRm-5BuYQYZBT_Q';
      const properResult = {
        'Id': id,
        'Name': 'Maelstrome',
      };
      const response = {
        data: properResult,
      };

      jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiEuropeClient').mockReturnValue({
        defaults: {
          baseURL: AlbionApiEndpoint.ALBION_EUROPE,
        },
        get: jest.fn().mockResolvedValueOnce(response),
      } as any);

      await expect(service.getCharacterById(id, AlbionServer.EUROPE))
        .resolves
        .toStrictEqual(properResult);
    });
    it('should return a character based on exact match amongst partial matches', async () => {
      const correctResult = { Id: 'be_K9ekCTg-bNzlmgNHZ5w', Name: 'Lilith1' };
      const searchResponse = {
        data: {
          guilds: [],
          players: [
            correctResult,
            { Id: 'syYdtLFvQZeqUR_ifCFdBA', Name: 'Lilith13' },
            { Id: '48fUbTddSfSc-nu9ru2QEw', Name: 'lilith1324' },
            { Id: 'CGgdqmeJRNOA86VLKpUvzw', Name: 'Lilith1527' },
          ],
        },
      };

      jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiEuropeClient').mockReturnValue({
        defaults: {
          baseURL: AlbionApiEndpoint.ALBION_EUROPE,
        },
        get: jest.fn()
          .mockResolvedValueOnce(searchResponse)
          .mockResolvedValueOnce({ data: correctResult }),
      } as any);

      await expect(service.getCharacter('Lilith1', AlbionServer.EUROPE))
        .resolves
        .toStrictEqual(correctResult);
    });
    it('should return a character named Dedalus17', async () => {
      const correctResult = { Id: '2RqNHDa6R7-pLCY5DqdOig', Name: 'Dedalus17' };
      const searchResponse = {
        data: {
          guilds: [],
          players: [
            correctResult,
          ],
        },
      };

      jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiEuropeClient').mockReturnValue({
        defaults: {
          baseURL: AlbionApiEndpoint.ALBION_EUROPE,
        },
        get: jest.fn().mockResolvedValueOnce(searchResponse).mockResolvedValueOnce({ data: correctResult }),
      } as any);

      await expect(service.getCharacter('Dedalus17', AlbionServer.EUROPE))
        .resolves
        .toStrictEqual(correctResult);
    });
    it('should return a character ID for Lugasi', async () => {
      const correctResultJson = '{"guilds":[],"players":[{"Id":"JRlDBmqHS86m764x-jc96g","Name":"Lugasi","GuildId":"0_zTfLfASD2Wtw6Tc-yckA","GuildName":"Dignity Of War","AllianceId":"t4Fl03pZRzaYTEczrDAesA","AllianceName":"DIG","Avatar":"","AvatarRing":"","KillFame":1391737,"DeathFame":2094479,"FameRatio":0.66,"totalKills":null,"gvgKills":null,"gvgWon":null}]}';
      const searchResponse = {
        data: JSON.parse(correctResultJson),
      };

      jest.spyOn(AlbionAxiosFactory.prototype, 'createAlbionApiEuropeClient').mockReturnValue({
        defaults: {
          baseURL: AlbionApiEndpoint.ALBION_EUROPE,
        },
        get: jest.fn().mockResolvedValueOnce(searchResponse),
      } as any);

      await expect(service.getCharacterId('Lugasi', AlbionServer.EUROPE))
        .resolves
        .toStrictEqual('JRlDBmqHS86m764x-jc96g');
    });
  });
});
