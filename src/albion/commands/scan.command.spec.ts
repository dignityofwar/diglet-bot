/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AlbionScanCommand } from './scan.command';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionScanningService } from '../services/albion.scanning.service';
import { ConfigService } from '@nestjs/config';

const scanChannelId = TestBootstrapper.mockConfig.discord.channels.albionScans;

describe('AlbionScanCommand', () => {
  let command: AlbionScanCommand;
  let albionScanningService: AlbionScanningService;
  let mockDiscordInteraction: any;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionScanCommand,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: AlbionScanningService,
          useValue: {
            startScan: jest.fn(),
          },
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    command = moduleRef.get<AlbionScanCommand>(AlbionScanCommand);
    albionScanningService = moduleRef.get<AlbionScanningService>(AlbionScanningService);

    const mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(scanChannelId, mockDiscordUser);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should initiate an Albion Scan if the channelId is correct', async () => {
    await command.onAlbionScanCommand({ dryRun: false }, mockDiscordInteraction);

    expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith('Starting Albion Members scan...');
    expect(albionScanningService.startScan).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('should not initiate an Albion Scan if the channelId is wrong', async () => {
    mockDiscordInteraction[0].channelId = 'wrongChannelId';

    const response = await command.onAlbionScanCommand({ dryRun: false }, mockDiscordInteraction);

    expect(response).toBe(`Please use the <#${scanChannelId}> channel to perform Scans.`);
    expect(mockDiscordInteraction[0].reply).toHaveBeenCalledWith(response);
    expect(mockDiscordInteraction[0].channel.send).not.toHaveBeenCalled();
    expect(albionScanningService.startScan).not.toHaveBeenCalled();
  });

  it('should flag a dry run in the response', async () => {
    const response = await command.onAlbionScanCommand({ dryRun: true }, mockDiscordInteraction);

    expect(albionScanningService.startScan).toHaveBeenCalledWith(expect.anything(), true);
    expect(response).toBe('Albion Scan initiated! [DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]');
  });

  it('should not flag a dry run when it is off', async () => {
    const response = await command.onAlbionScanCommand({ dryRun: false }, mockDiscordInteraction);

    expect(response).toBe('Albion Scan initiated!');
    expect(mockDiscordInteraction[0].reply).toHaveBeenCalledWith(response);
  });
});
