/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AlbionLogCommand } from './log.command';
import { Logger } from '@nestjs/common';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('AlbionLogCommand', () => {
  let command: AlbionLogCommand;
  let mockDiscordInteraction: any;
  let mockDiscordUser: any;
  const expectedChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionLogCommand,
        {
          provide: Logger,
          useValue: {
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    command = module.get<AlbionLogCommand>(AlbionLogCommand);
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(expectedChannelId, mockDiscordUser);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should send a log-themed message', async () => {
    const expectedMessage = `# 🪵\n
Live by the log,
Die by the log.
The log is life, the log is true
The log shall conquer,
The log is good,
The log is hard,
The log is girthy, the log is big.
The log will log our logs with speed.`;

    await command.onAlbionLogCommand(mockDiscordInteraction);

    expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith(expectedMessage);
  });

  it('should randomly send one of the predefined images', async () => {
    await command.onAlbionLogCommand(mockDiscordInteraction);

    expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith(expect.any(String));
    expect(mockDiscordInteraction[0].channel.send.mock.calls[1][0]).toContain('https://cdn.discordapp.com/attachments/');
  });

  it('should react with a log emoji', async () => {
    await command.onAlbionLogCommand(mockDiscordInteraction);

    expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith(expect.any(String));
    expect(mockDiscordInteraction[0].channel.send.mock.results[1].value.react).toHaveBeenCalledWith('🪵');
  });
});
