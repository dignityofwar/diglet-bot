/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { PS2VerifyCommand } from './verify.command';
import { CensusApiService } from '../service/census.api.service';
import { PS2VerifyDto } from '../dto/PS2VerifyDto';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { PS2GameVerificationService } from '../service/ps2.game.verification.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const mockChannelId = TestBootstrapper.mockConfig.discord.channels.ps2Verify;
const mockOutfitId = TestBootstrapper.mockConfig.ps2.outfitId;

describe('PS2VerifyCommand', () => {
  let command: PS2VerifyCommand;
  let censusApiService: CensusApiService;
  let ps2GameVerificationService: PS2GameVerificationService;

  let mockDiscordUser: any;
  let mockCharacter: CensusCharacterWithOutfitInterface;
  let mockDiscordInteraction: any;
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
    TestBootstrapper.setupConfig(module);

    command = module.get<PS2VerifyCommand>(PS2VerifyCommand);
    censusApiService = module.get<CensusApiService>(CensusApiService);
    ps2GameVerificationService = module.get<PS2GameVerificationService>(
      PS2GameVerificationService,
    );

    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(
      mockChannelId,
      mockDiscordUser,
    );

    mockCharacter = TestBootstrapper.getMockPS2Character(
      '5428010618035323201',
      mockOutfitId,
    );
    censusApiService.getCharacter = jest
      .fn()
      .mockImplementation(() => mockCharacter);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should return a message if command did not come from the correct channel', async () => {
    mockDiscordInteraction[0].channelId = '1234';

    const response = await command.onPS2VerifyCommand(
      dto,
      mockDiscordInteraction,
    );

    expect(response).toBe(
      `Please use the <#${mockChannelId}> channel to register.`,
    );
  });

  it('should return a message if the character could not be found', async () => {
    censusApiService.getCharacter = jest.fn().mockImplementation(() => {
      throw new Error(
        `Character \`${dto.character}\` does not exist. Please ensure you have supplied your exact name.`,
      );
    });

    const response = await command.onPS2VerifyCommand(
      dto,
      mockDiscordInteraction,
    );

    expect(response).toBe(
      `Character \`${dto.character}\` does not exist. Please ensure you have supplied your exact name.`,
    );
  });

  it('should correctly prevent characters outside of the outfit from registering', async () => {
    censusApiService.getCharacter = jest.fn().mockImplementation(() => {
      return {
        ...mockCharacter,
        outfit_info: {
          outfit_id: '1234567', // Changed
          character_id: mockCharacter.character_id,
          member_since: '1441379570',
          member_since_date: '2015-09-04 15:12:50.0',
          rank: 'Platoon Leader',
          rank_ordinal: '3',
        },
      };
    });

    const response = await command.onPS2VerifyCommand(
      dto,
      mockDiscordInteraction,
    );

    expect(response).toBe(
      'Your character **Maelstrome26** has not been detected in the [DIG] outfit. If you are in the outfit, please log out and in again, or wait 24 hours and try again as Census (the game\'s API) can be slow to update sometimes.',
    );
  });

  it('should return any errors presented by the verification service', async () => {
    const errorMessage = `Character **${dto.character}** has already been registered by user "Foobar". Please complete it before attempting again.`;
    ps2GameVerificationService.isValidRegistrationAttempt = jest
      .fn()
      .mockImplementation(() => errorMessage);

    const response = await command.onPS2VerifyCommand(
      dto,
      mockDiscordInteraction,
    );

    expect(response).toBe(errorMessage);
  });

  it('should allow characters within the outfit to continue registering', async () => {
    ps2GameVerificationService.isValidRegistrationAttempt = jest
      .fn()
      .mockImplementation(() => true);

    const response = await command.onPS2VerifyCommand(
      dto,
      mockDiscordInteraction,
    );

    expect(response).toBe(
      '==================\nVerification started, if the bot hasn\'t responded within 30 seconds, please try again.',
    );
  });

  it('should correctly handle edge case character', async () => {
    censusApiService.getCharacter = jest.fn().mockImplementation(() => {
      return {
        character_id: '5428660720835917857',
        name: {
          first: 'HARRYPOUSINI',
          first_lower: 'harrypousini',
        },
        outfit_info: {
          outfit_id: mockOutfitId,
          character_id: '5428660720835917857',
          member_since: '1584546134',
          member_since_date: '2020-03-18 15:42:14.0',
          rank: 'Zealot',
          rank_ordinal: '6',
        },
      };
    });
    ps2GameVerificationService.isValidRegistrationAttempt = jest
      .fn()
      .mockImplementation(() => true);

    const response = await command.onPS2VerifyCommand(
      dto,
      mockDiscordInteraction,
    );

    expect(response).toBe(
      '==================\nVerification started, if the bot hasn\'t responded within 30 seconds, please try again.',
    );
  });
});
