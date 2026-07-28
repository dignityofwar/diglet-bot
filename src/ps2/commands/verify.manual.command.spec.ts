/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PS2VerifyManualCommand } from './verify.manual.command';
import { CensusApiService } from '../service/census.api.service';
import { PS2GameVerificationService } from '../service/ps2.game.verification.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const mockVerifyChannelId = TestBootstrapper.mockConfig.discord.channels.ps2Verify;
const mockOutfitId = TestBootstrapper.mockConfig.ps2.outfitId;

describe('PS2VerifyManualCommand', () => {
  let command: PS2VerifyManualCommand;
  let censusApiService: CensusApiService;
  let ps2GameVerificationService: PS2GameVerificationService;
  let mockDiscordInteraction: any;
  let dto: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PS2VerifyManualCommand,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: CensusApiService,
          useValue: { getCharacter: jest.fn() },
        },
        {
          provide: PS2GameVerificationService,
          useValue: {
            isValidRegistrationAttempt: jest.fn().mockResolvedValue(true),
            forceAdd: jest.fn(),
            forceRemove: jest.fn(),
          },
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(module);

    command = module.get<PS2VerifyManualCommand>(PS2VerifyManualCommand);
    censusApiService = module.get<CensusApiService>(CensusApiService);
    ps2GameVerificationService = module.get<PS2GameVerificationService>(PS2GameVerificationService);

    const mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(mockVerifyChannelId, mockDiscordUser);

    dto = { character: 'Maelstrome26', discordUser: mockDiscordUser.user, remove: false };

    censusApiService.getCharacter = jest.fn()
      .mockResolvedValue(TestBootstrapper.getMockPS2Character('5428010618035323201', mockOutfitId));
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should refuse to run from the wrong channel', async () => {
    mockDiscordInteraction[0].channelId = 'wrongChannelId';

    const response = await command.onPS2VerifyManualCommand(dto, mockDiscordInteraction);

    expect(response).toBe(`Please use the <#${mockVerifyChannelId}> channel to register.`);
    expect(mockDiscordInteraction[0].reply).toHaveBeenCalledWith(response);
    expect(censusApiService.getCharacter).not.toHaveBeenCalled();
  });

  it('should return the census error when the character cannot be found', async () => {
    censusApiService.getCharacter = jest.fn().mockImplementation(() => {
      throw new Error('Character `Maelstrome26` does not exist.');
    });

    const response = await command.onPS2VerifyManualCommand(dto, mockDiscordInteraction);

    expect(response).toBe('Character `Maelstrome26` does not exist.');
    expect(ps2GameVerificationService.forceAdd).not.toHaveBeenCalled();
  });

  it('should reject a character outside the outfit', async () => {
    censusApiService.getCharacter = jest.fn().mockResolvedValue(
      TestBootstrapper.getMockPS2Character('5428010618035323201', 'someOtherOutfitId'),
    );

    const response = await command.onPS2VerifyManualCommand(dto, mockDiscordInteraction);

    expect(response).toContain('has not been detected in the [DIG]');
    expect(ps2GameVerificationService.forceAdd).not.toHaveBeenCalled();
  });

  it('should return the verification service error when the attempt is invalid', async () => {
    const errorMessage = 'Character has already been registered.';
    ps2GameVerificationService.isValidRegistrationAttempt = jest.fn().mockResolvedValue(errorMessage);

    const response = await command.onPS2VerifyManualCommand(dto, mockDiscordInteraction);

    expect(response).toBe(errorMessage);
    expect(ps2GameVerificationService.forceAdd).not.toHaveBeenCalled();
  });

  it('should manually verify a valid member', async () => {
    const response = await command.onPS2VerifyManualCommand(dto, mockDiscordInteraction);

    expect(ps2GameVerificationService.forceAdd).toHaveBeenCalled();
    expect(response).toBe('Member manually verified.');
    expect(mockDiscordInteraction[0].reply).toHaveBeenCalledWith(response);
  });

  it('should skip the outfit checks and unverify when remove is set', async () => {
    dto.remove = true;

    const response = await command.onPS2VerifyManualCommand(dto, mockDiscordInteraction);

    expect(ps2GameVerificationService.forceRemove).toHaveBeenCalled();
    expect(ps2GameVerificationService.isValidRegistrationAttempt).not.toHaveBeenCalled();
    expect(response).toBe('Member manually unverified.');
  });
});
