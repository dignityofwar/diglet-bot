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

    // Filled spies
    jest.spyOn(command['logger'], 'error');
    jest.spyOn(command['logger'], 'warn');
    jest.spyOn(command['logger'], 'log');
    jest.spyOn(command['logger'], 'debug');
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
      expect(mockDiscordMessage.channel.send).toHaveBeenLastCalledWith({
        content: '# This is for DIG _Guild_ registrations only.\n' +
'For alliance, see here: https://discord.com/channels/90078410642034688/1375362179834052688/1375362497460178975',
        flags: 4,
      });
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

  describe('sendAllianceRegistrationReminder', () => {
    it('should delete the last reminder message if it exists', async () => {
      command['lastAllianceReminderMessageId'] = '1234567890';
      const mockDelete = jest.fn();
      const mockLastMessage = { delete: mockDelete };
      mockDiscordMessage.channel.messages.fetch = jest.fn().mockResolvedValue(mockLastMessage);

      await command.sendAllianceRegistrationReminder(mockDiscordMessage);

      expect(mockDiscordMessage.channel.messages.fetch).toHaveBeenCalledWith('1234567890');
      expect(mockDelete).toHaveBeenCalled();
      expect(mockDiscordMessage.channel.send).toHaveBeenCalled();
    });

    it('should log an error when unable to delete message', async () => {
      command['lastAllianceReminderMessageId'] = '1234567890';
      const mockDelete = jest.fn().mockImplementation(() => {
        throw new Error('Unable to delete message');
      });
      const mockLastMessage = { delete: mockDelete };
      mockDiscordMessage.channel.messages.fetch = jest.fn().mockResolvedValue(mockLastMessage);

      await command.sendAllianceRegistrationReminder(mockDiscordMessage);

      expect(mockDiscordMessage.channel.messages.fetch).toHaveBeenCalledWith('1234567890');
      expect(mockDelete).toHaveBeenCalled();
      expect(command['logger'].error).toHaveBeenCalledWith('Failed to delete last alliance reminder message: Unable to delete message');
    });

    it('should send a new reminder message and set the message ID', async () => {
      const mockSend = jest.fn().mockResolvedValue({ id: 'newMessageId' });
      mockDiscordMessage.channel.send = mockSend;

      await command.sendAllianceRegistrationReminder(mockDiscordMessage);

      expect(mockSend).toHaveBeenCalledWith({
        content: '# This is for DIG _Guild_ registrations only.\n' +
          'For alliance, see here: https://discord.com/channels/90078410642034688/1375362179834052688/1375362497460178975',
        flags: 4,
      });
      expect(command['lastAllianceReminderMessageId']).toBe('newMessageId');
    });
  });
});
