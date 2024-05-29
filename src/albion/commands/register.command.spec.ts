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

  let mockDiscordInteraction: any;
  let mockDiscordUser: any;
  const dto: AlbionRegisterDto = { character: 'Maelstrome26', server: AlbionServer.AMERICAS };

  beforeEach(async () => {
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRegisterCommand,
        ReflectMetadataProvider,
        {
          provide: AlbionRegistrationService,
          useValue: {
            registrationMessageProxy: jest.fn(),
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
    TestBootstrapper.setupConfig(module);

    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(expectedChannelId, mockDiscordUser);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should return a message if command did not come from the correct channel', async () => {
    mockDiscordInteraction[0].channelId = '1234';

    expect(await command.onAlbionRegisterCommand(dto, mockDiscordInteraction)).toBe(`Please use the <#${expectedChannelId}> channel to register.`);
  });

  it('should return a response to the user', async () => {
    const result = await command.onAlbionRegisterCommand(dto, mockDiscordInteraction);

    expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith('🔍 Running registration process...');

    expect(result).toBe('Registration request sent!');
  });
});
