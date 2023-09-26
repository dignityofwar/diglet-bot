/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AlbionRegisterCommand } from './register.command';
import { AlbionApiService } from '../services/albion.api.service';
import { ConfigService } from '@nestjs/config';
import { AlbionRegisterDto } from '../dto/albion.register.dto';

import { SnowflakeUtil } from 'discord.js';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { PlayersResponseInterface } from '../interfaces/albion.api.interfaces';
import * as _ from 'lodash';

const expectedChannelId = '1234567890';
const expectedWelcomeChannelId = '5555444455555';
const expectedRoleId = '987654321';
const expectedDevUserId = '1234575897';
const expectedGuildId = '56666666666';

describe('AlbionRegisterCommand', () => {
  let command: AlbionRegisterCommand;
  let albionApiService: AlbionApiService;
  let config: ConfigService;

  let mockUser: any;
  let mockCharacter: PlayersResponseInterface;
  let mockInteraction: any;
  const dto: AlbionRegisterDto = { character: 'Maelstrome26' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRegisterCommand,
        ReflectMetadataProvider,
        {
          provide: AlbionApiService,
          useValue: {
            getCharacter: jest.fn(),
            getCharacterId: jest.fn(),
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

    command = module.get<AlbionRegisterCommand>(AlbionRegisterCommand);
    albionApiService = module.get<AlbionApiService>(AlbionApiService);
    config = module.get<ConfigService>(ConfigService);

    // Spy on the 'get' method of the ConfigService, and make it return a specific values based on the path
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        albion: {
          guildGameId: expectedGuildId,
        },
        discord: {
          devUserId: expectedDevUserId,
          channels: {
            albionRegistration: expectedChannelId,
            albionWelcomeToAlbion: expectedWelcomeChannelId,
          },
          roles: {
            albionInitiateRoleId: expectedRoleId,
          },
        },
      };

      const result = _.get(data, key);

      if (!result) {
        throw new Error(`Unexpected config key: ${key}`);
      }

      return result;
    });

    // A mock instance of User
    mockUser = {
      createdAt: new Date(),
      createdTimestamp: Date.now(),
      discriminator: '0000',
      defaultAvatarURL: 'https://defaultavatar.url',
      id: SnowflakeUtil.generate(),
      tag: 'TestUser#0000',
      username: 'TestUser',
      fetch: jest.fn(),
      fetchFlags: jest.fn(),
      toString: jest.fn().mockReturnValue('<@userId>'), // Mocked
      setNickname: jest.fn().mockResolvedValue(() => true),
      roles: {
        add: jest.fn().mockResolvedValue(() => true),
      },
    };

    mockCharacter = {
      data: {
        AverageItemPower: 1337,
        Id: '123456789',
        Name: 'TestUser',
        GuildId: expectedGuildId,
      } as any,
    };

    mockInteraction = [
      {
        channelId: expectedChannelId,
        guild: {
          roles: {
            fetch: jest.fn().mockReturnValue({ id: expectedRoleId }),
          },
          members: {
            fetch: jest.fn().mockReturnValue(mockUser),
          },
        },
        user: mockUser,
      },
    ];
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  // Here is an example test case
  it('should return a message if command did not come from the correct channel', async () => {
    mockInteraction[0].channelId = '1234';

    const response = await command.onAlbionRegisterCommand(dto, mockInteraction);

    expect(response).toBe(`Please use the <#${expectedChannelId}> channel to register.`);
  });

  it('should return a message if the initiate role could not be found', async () => {
    mockInteraction[0].guild.roles.fetch = jest.fn().mockReturnValue(null);

    const response = await command.onAlbionRegisterCommand(dto, mockInteraction);

    expect(response).toBe(`Unable to find the initiate role! Pinging <@${expectedDevUserId}>!`);
  });

  it('should return a message if the character could not be found', async () => {
    albionApiService.getCharacter = jest.fn().mockImplementation(() => {
      throw new Error('Character does not exist. Please ensure you have supplied your exact name.');
    });

    const response = await command.onAlbionRegisterCommand(dto, mockInteraction);

    expect(response).toBe('Character does not exist. Please ensure you have supplied your exact name.');
  });

  it('should correctly prevent characters outside of the guild from registering', async () => {
    albionApiService.getCharacter = jest.fn().mockImplementation(() => {
      return {
        data: {
          'Id': 'iQxOa5DJTvmxu9oy7pDIiA',
          'Name': 'Wildererntner',
          'GuildId': '2rzN1ma_T9ejhkFPq0t-Uw',
          'GuildName': 'Lacking DPS',
          'AllianceId': '',
          'AllianceName': null,
          'Avatar': '',
          'AvatarRing': '',
          'KillFame': 35159669,
          'DeathFame': 27246434,
          'FameRatio': 1.29,
          'totalKills': null,
          'gvgKills': null,
          'gvgWon': null,
        },
      };
    });

    const response = await command.onAlbionRegisterCommand(dto, mockInteraction);

    expect(response).toBe('Your character "Wildererntner" is not in the guild. If you are in the guild, please ensure you have spelt the name **exactly** correct. If it still doesn\'t work, try again later as our data source may be out of date.');
  });

  it('should return an error if there are duplicate players due to lack of uniqueness of characters in the game', async () => {
    const errorMessage = `Multiple characters with exact name "${mockUser.username}" found. Please contact the Guild Masters as manual intervention is required.`;
    albionApiService.getCharacter = jest.fn().mockImplementation(() => {
      throw new Error(errorMessage);
    });

    const response = await command.onAlbionRegisterCommand(dto, mockInteraction);

    expect(response).toBe(errorMessage);
  });

  it('should return a success message if the character is actually a member of the guild', async () => {
    albionApiService.getCharacter = jest.fn().mockImplementation(() => mockCharacter);

    const response = await command.onAlbionRegisterCommand(dto, mockInteraction);

    expect(response).toBe(`Thank you ${mockUser.username}, you've been verified as a [DIG] guild member! Please read the information within <#${expectedWelcomeChannelId}> to be fully acquainted with the guild! Don't forget to grab roles for areas of interest in <id:customize> under the Albion section!`);
  });

  it('should return a message if the character is not a member of the guild', async () => {
    mockCharacter.data.GuildId = '1337';

    albionApiService.getCharacter = jest.fn().mockImplementation(() => mockCharacter);

    const response = await command.onAlbionRegisterCommand(dto, mockInteraction);

    expect(response).toBe(`Your character "${mockCharacter.data.Name}" is not in the guild. If you are in the guild, please ensure you have spelt the name **exactly** correct. If it still doesn't work, try again later as our data source may be out of date.`);
  });
});
