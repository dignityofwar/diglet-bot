/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { SnowflakeUtil } from 'discord.js';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import * as _ from 'lodash';
import { PS2VerifyCommand } from './verify.command';
import { CensusApiService } from '../service/census.api.service';
import { PS2VerifyDto } from '../dto/PS2VerifyDto';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { PS2GameVerificationService } from '../service/ps2.game.verification.service';

const expectedChannelId = '1234567890';
const expectedRoleId = '987654321';
const expectedCharacterId = '5428010618035323201';
const expectedOutfitId = '37509488620604883';

describe('PS2VerifyCommand', () => {
  let command: PS2VerifyCommand;
  let censusApiService: CensusApiService;
  let config: ConfigService;

  let mockUser: any;
  let mockCharacter: CensusCharacterWithOutfitInterface;
  let mockInteraction: any;
  const dto: PS2VerifyDto = { character: 'Maelstrome26' };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PS2VerifyCommand,
        PS2GameVerificationService,
        ReflectMetadataProvider,
        {
          provide: CensusApiService,
          useValue: {
            getCharacter: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: PS2GameVerificationService,
          useValue: {
            isValidRegistrationAttempt: jest.fn(),
            watch: jest.fn(),
          },
        },
      ],
    }).compile();

    command = module.get<PS2VerifyCommand>(PS2VerifyCommand);
    censusApiService = module.get<CensusApiService>(CensusApiService);
    config = module.get<ConfigService>(ConfigService);

    // Spy on the 'get' method of the ConfigService, and make it return a specific values based on the path
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        app: {
          ps2: {
            outfitId: expectedOutfitId,
          },
        },
        discord: {
          channels: {
            ps2Verify: expectedChannelId,
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
      character_id: expectedCharacterId,
      name: {
        first: 'Maelstrome26',
        first_lower: 'maelstrome26',
      },
      faction_id: '1',
      outfit_info: {
        outfit_id: expectedOutfitId,
        character_id: expectedCharacterId,
        member_since: '1441379570',
        member_since_date: '2015-09-04 15:12:50.0',
        rank: 'Platoon Leader',
        rank_ordinal: '3',
      },
    } as any;

    censusApiService.getCharacter = jest.fn().mockImplementation(() => mockCharacter);

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

    const response = await command.onPS2VerifyCommand(dto, mockInteraction);

    expect(response).toBe(`Please use the <#${expectedChannelId}> channel to register.`);
  });

  it('should return a message if the character could not be found', async () => {
    censusApiService.getCharacter = jest.fn().mockImplementation(() => {
      throw new Error(`Character "${dto.character}" does not exist. Please ensure you have supplied your exact name.`);
    });

    const response = await command.onPS2VerifyCommand(dto, mockInteraction);

    expect(response).toBe(`Character "${dto.character}" does not exist. Please ensure you have supplied your exact name.`);
  });

  it('should correctly prevent characters outside of the outfit from registering', async () => {
    censusApiService.getCharacter = jest.fn().mockImplementation(() => {
      return {
        ...mockCharacter,
        'outfit_info': {
          'outfit_id': '1234567', // Changed
          'character_id': expectedCharacterId,
          'member_since': '1441379570',
          'member_since_date': '2015-09-04 15:12:50.0',
          'rank': 'Platoon Leader',
          'rank_ordinal': '3',
        },
      };
    });

    const response = await command.onPS2VerifyCommand(dto, mockInteraction);

    expect(response).toBe('Your character "Maelstrome26" has not been detected in the [DIG] outfit. If you are in the outfit, please log out and in again, or wait 24 hours and try again as Census (the game\'s API) can be slow to update sometimes.');
  });
});
