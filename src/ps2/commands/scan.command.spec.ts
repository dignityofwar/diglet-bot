/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { PS2ScanCommand } from './scan.command';
import { PS2GameScanningService } from '../service/ps2.game.scanning.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const mockScanChannelId = TestBootstrapper.mockConfig.discord.channels.ps2Scans;

describe('PS2ScanCommand', () => {
  let command: PS2ScanCommand;
  let ps2GameScanningService: PS2GameScanningService;
  let mockDiscordInteraction: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PS2ScanCommand,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: PS2GameScanningService,
          useValue: { startScan: jest.fn() },
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(module);

    command = module.get<PS2ScanCommand>(PS2ScanCommand);
    ps2GameScanningService = module.get<PS2GameScanningService>(PS2GameScanningService);

    const mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(mockScanChannelId, mockDiscordUser);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should refuse to scan when run from the wrong channel', async () => {
    mockDiscordInteraction[0].channelId = 'wrongChannelId';

    const response = await command.onPS2ScanCommand({ dryRun: false }, mockDiscordInteraction);

    expect(response).toBe(`Please use the <#${mockScanChannelId}> channel to perform Scans.`);
    expect(mockDiscordInteraction[0].reply).toHaveBeenCalledWith(response);
    expect(mockDiscordInteraction[0].channel.send).not.toHaveBeenCalled();
    expect(ps2GameScanningService.startScan).not.toHaveBeenCalled();
  });

  it('should start a scan when run from the correct channel', async () => {
    const response = await command.onPS2ScanCommand({ dryRun: false }, mockDiscordInteraction);

    expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith('Starting scan...');
    expect(ps2GameScanningService.startScan).toHaveBeenCalledWith(expect.anything(), false);
    expect(response).toBe('Scan initiated. ');
    expect(mockDiscordInteraction[0].reply).toHaveBeenCalledWith(response);
  });

  it('should flag a dry run in the response', async () => {
    const response = await command.onPS2ScanCommand({ dryRun: true }, mockDiscordInteraction);

    expect(ps2GameScanningService.startScan).toHaveBeenCalledWith(expect.anything(), true);
    expect(response).toBe('Scan initiated. [DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]');
    expect(mockDiscordInteraction[0].reply).toHaveBeenCalledWith(response);
  });
});
