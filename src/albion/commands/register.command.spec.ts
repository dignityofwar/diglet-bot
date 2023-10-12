/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AlbionRegisterCommand } from './register.command';
import { AlbionApiService } from '../services/albion.api.service';
import { ConfigService } from '@nestjs/config';
import { AlbionRegisterDto } from '../dto/albion.register.dto';

import { SnowflakeUtil } from 'discord.js';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { AlbionPlayersResponseInterface } from '../interfaces/albion.api.interfaces';
import * as _ from 'lodash';
import { AlbionRegistrationService } from '../services/albion.registration.service';

const expectedChannelId = '1234567890';
const expectedWelcomeChannelId = '5555444455555';
const expectedRoleId = '987654321';
const expectedDevUserId = '1234575897';
const expectedGuildId = '56666666666';

describe('AlbionRegisterCommand', () => {
  let command: AlbionRegisterCommand;
  let albionApiService: AlbionApiService;
  let albionRegistrationService: AlbionRegistrationService;
  let config: ConfigService;

  let mockUser: any;
  let mockCharacter: AlbionPlayersResponseInterface;
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
          provide: AlbionRegistrationService,
          useValue: {
            isValidRegistrationAttempt: jest.fn(),
            handleVerification: jest.fn(),
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
    albionRegistrationService = module.get<AlbionRegistrationService>(AlbionRegistrationService);
    config = module.get<ConfigService>(ConfigService);

    // Spy on the 'get' method of the ConfigService, and make it return a specific values based on the path
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        albion: {
          guildId: expectedGuildId,
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

    // A mock instance of a Discord User
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

  it('should return a message if command did not come from the correct channel', async () => {
    mockInteraction[0].channelId = '1234';

    expect(await command.onAlbionRegisterCommand(dto, mockInteraction)).toBe(`Please use the <#${expectedChannelId}> channel to register.`);
  });

  it('should return errors upon character API failure', async () => {
    albionApiService.getCharacter = jest.fn().mockImplementation(() => {
      throw new Error('Some error fetching character');
    });
    expect(await command.onAlbionRegisterCommand(dto, mockInteraction)).toBe('⛔️ **ERROR:** Some error fetching character');
  });

  it('should return errors from the registration process', async () => {
    albionApiService.getCharacter = jest.fn().mockImplementation(() => mockCharacter);
    albionRegistrationService.handleRegistration = jest.fn().mockImplementation(() => {
      throw new Error('Some error handling registration');
    });

    expect(await command.onAlbionRegisterCommand(dto, mockInteraction)).toBe('⛔️ **ERROR:** Some error handling registration');
  });

  it('should return the success message if the character has successfully been registered', async () => {
    albionApiService.getCharacter = jest.fn().mockImplementation(() => mockCharacter);
    albionRegistrationService.handleRegistration = jest.fn().mockImplementation(() => true);

    expect(await command.onAlbionRegisterCommand(dto, mockInteraction)).toBe(`## ✅ Thank you **${mockUser.displayName}**, you've been verified as a [DIG] guild member! 🎉
    
* ➡️ Please read the information within <#5555444455555> to be fully acquainted with the guild!
    
* 👉️ Grab opt-in roles of interest in <id:customize> under the Albion section! It is _important_ you do this, otherwise you may miss content.
    
* ℹ️ Your Discord server nickname has been automatically changed to match your character name. You are free to change this back should you want to, but please make sure it resembles your in-game name.`);
  });
});
