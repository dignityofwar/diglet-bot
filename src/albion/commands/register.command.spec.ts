/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AlbionRegisterCommand } from './register.command';
import { AlbionApiService } from '../services/albion.api.service';
import { ConfigService } from '@nestjs/config';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { AlbionPlayersResponseInterface } from '../interfaces/albion.api.interfaces';
import { AlbionRegistrationService } from '../services/albion.registration.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const expectedChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;

describe('AlbionRegisterCommand', () => {
  let command: AlbionRegisterCommand;
  let albionApiService: AlbionApiService;
  let albionRegistrationService: AlbionRegistrationService;

  let mockCharacter: AlbionPlayersResponseInterface;
  let mockInteraction: any;
  let mockDiscordUser: any;
  const dto: AlbionRegisterDto = { character: 'Maelstrome26' };

  beforeEach(async () => {
    TestBootstrapper.mockORM();
    mockCharacter = TestBootstrapper.getMockAlbionCharacter(TestBootstrapper.mockConfig.albion.guildId) as any;
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
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
    TestBootstrapper.setupConfig(module);

    mockInteraction = TestBootstrapper.getMockDiscordInteraction(expectedChannelId, mockDiscordUser);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should return a message if command did not come from the correct channel', async () => {
    mockInteraction[0].channelId = '1234';

    expect(await command.onAlbionRegisterCommand(dto, mockInteraction)).toBe(`Please use the <#${expectedChannelId}> channel to register.`);
  });

  it('should return errors from the registration process', async () => {
    albionApiService.getCharacter = jest.fn().mockImplementation(() => mockCharacter);
    albionRegistrationService.handleRegistration = jest.fn().mockImplementation(() => {
      throw new Error('Some error handling registration');
    });

    const result = await command.onAlbionRegisterCommand(dto, mockInteraction);

    // Check that send was called with the expected argument
    expect(mockInteraction[0].channel.send).toHaveBeenCalledWith('🔍 Running registration process...');

    // Capture the mock message object returned by send
    const sentMessage = mockInteraction[0].channel.send.mock.results[0].value;

    // Check that the edit method on the sentMessage was called with the expected argument
    expect(sentMessage.edit).toHaveBeenCalledWith('⛔️ **ERROR:** Some error handling registration');

    // Check the final result
    expect(result).toBe('');
  });

  it('should return no response', async () => {
    albionRegistrationService.handleRegistration = jest.fn().mockImplementation(() => true);
    expect(await command.onAlbionRegisterCommand(dto, mockInteraction)).toBe('');
  });
});
