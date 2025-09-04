/* eslint-disable @typescript-eslint/no-explicit-any */
import { PingCommand } from './ping.command';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('PingCommand', () => {
  let service: PingCommand;
  let mockInteraction: any;
  let mockConfigService: ConfigService;
  let mockDiscordUser: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [PingCommand, ConfigService],
    }).compile();

    service = moduleRef.get<PingCommand>(PingCommand);
    mockConfigService = moduleRef.get<ConfigService>(ConfigService);
    // Mock a ChatInputCommandInteraction
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockInteraction = TestBootstrapper.getMockDiscordInteraction(
      '123456789',
      mockDiscordUser,
    )[0];
  });

  it('should pong', async () => {
    const version = '1.2.3';
    jest.spyOn(mockConfigService, 'get').mockReturnValue(version);

    await service.onPingCommand(mockInteraction);

    expect(mockInteraction.reply).toHaveBeenCalledWith({
      content: `Hello ${mockInteraction.user.username}, I'm alive! Version: ${version}`,
    });
  });
});
