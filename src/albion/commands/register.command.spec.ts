/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AlbionRegisterCommand } from './register.command';
import { ConfigService } from '@nestjs/config';
import { AlbionRegisterDto } from '../dto/albion.register.dto';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { AlbionRegistrationService } from '../services/albion.registration.service';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionServer } from '../interfaces/albion.api.interfaces';

const expectedChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;

describe('AlbionRegisterCommand', () => {
  let command: AlbionRegisterCommand;
  let albionRegistrationService: AlbionRegistrationService;

  let mockDiscordInteraction: any;
  let mockDiscordUser: any;
  let mockDiscordMessage: any;
  const dto: AlbionRegisterDto = { character: 'Maelstrome26' };

  beforeEach(async () => {
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRegisterCommand,
        ReflectMetadataProvider,
        {
          provide: AlbionRegistrationService,
          useValue: {
            handleRegistration: jest.fn(),
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
    TestBootstrapper.setupConfig(module);

    command = module.get<AlbionRegisterCommand>(AlbionRegisterCommand);
    albionRegistrationService = module.get<AlbionRegistrationService>(AlbionRegistrationService);

    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(expectedChannelId, mockDiscordUser);
    mockDiscordMessage = TestBootstrapper.getMockDiscordMessage();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('onAlbionRegisterCommand', () => {
    it('should return a message if command did not come from the correct channel', async () => {
      mockDiscordInteraction[0].channelId = '1234';

      expect(await command.onAlbionRegisterCommand(dto, mockDiscordInteraction)).toBe(`Please use the <#${expectedChannelId}> channel to register.`);
    });
    it('should return a response to the user and call the proxy', async () => {
      command.registrationCommandProxy = jest.fn();
      const result = await command.onAlbionRegisterCommand(dto, mockDiscordInteraction);

      expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith('🔍 Running registration process...');
      expect(result).toBe('Registration request sent!');
      expect(command.registrationCommandProxy).toHaveBeenCalledWith(
        dto.character,
        AlbionServer.EUROPE,
        mockDiscordUser.id,
        mockDiscordUser.guild.id,
        mockDiscordInteraction[0].channelId,
        expect.any(Object),
      );
    });
  });

  describe('registrationCommandProxy', () => {
    it('should call the registration service', async () => {
      await command.registrationCommandProxy(
        dto.character,
        AlbionServer.EUROPE,
        mockDiscordUser.id,
        mockDiscordUser.guild.id,
        mockDiscordInteraction[0].channelId,
        mockDiscordMessage
      );

      expect(albionRegistrationService.handleRegistration).toHaveBeenCalledWith(
        dto.character,
        AlbionServer.EUROPE,
        mockDiscordUser.id,
        mockDiscordUser.guild.id,
        mockDiscordInteraction[0].channelId
      );
      expect(mockDiscordMessage.delete).toHaveBeenCalled();
    });
    it('should handle errors from the registration service', async () => {
      const errorMessage = `Sorry <@${mockDiscordUser.id}>, Something went boom!`;
      albionRegistrationService.handleRegistration = jest.fn().mockRejectedValue(new Error(errorMessage));

      await command.registrationCommandProxy(
        dto.character,
        AlbionServer.EUROPE,
        mockDiscordUser.id,
        mockDiscordUser.guild.id,
        mockDiscordInteraction[0].channelId,
        mockDiscordMessage
      );

      expect(albionRegistrationService.handleRegistration).toHaveBeenCalledWith(
        dto.character,
        AlbionServer.EUROPE,
        mockDiscordUser.id,
        mockDiscordUser.guild.id,
        mockDiscordInteraction[0].channelId
      );
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(`⛔️ **ERROR:** ${errorMessage}`);
      expect(mockDiscordMessage.delete).toHaveBeenCalled();
    });
  });
});
