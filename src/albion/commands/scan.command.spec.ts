/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { AlbionScanCommand } from './scan.command';
import { TestBootstrapper } from '../../test.bootstrapper';
import { AlbionScanningService } from '../services/albion.scanning.service';
import { ConfigService } from '@nestjs/config';
import { ReflectMetadataProvider } from '@discord-nestjs/core';

describe('AlbionScanCommand', () => {
  let command: AlbionScanCommand;
  let mockDiscordInteraction: any;
  let mockDiscordUser: any;
  let scanChannelId: string;
  // let albionScanningService: AlbionScanningService;
  // const dto = { dryRun: false }; // example payload

  const expectedChannelId =
    TestBootstrapper.mockConfig.discord.channels.albionRegistration;

  beforeEach(async () => {
    scanChannelId = TestBootstrapper.mockConfig.discord.channels.albionScans;
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionScanCommand,
        ConfigService,
        ReflectMetadataProvider,
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
    // albionScanningService = moduleRef.get<AlbionScanningService>(AlbionScanningService);
    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(
      expectedChannelId,
      mockDiscordUser,
    );
    scanChannelId = TestBootstrapper.mockConfig.discord.channels.albionScans;
    mockDiscordInteraction[0].channelId = scanChannelId;
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  // TODO: RESTORE TESTS!
  // it('should initiate an Albion Scan if the channelId is correct', async () => {
  //
  //   await command.onAlbionScanCommand(dto, mockDiscordInteraction);
  //
  //   expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith('Starting Albion Members scan...');
  //   expect(albionScanningService.startScan).toHaveBeenCalled();
  // });
  //
  // it('should not initiate an Albion Scan if the channelId is wrong', async () => {
  //   // override the channelId of mockDiscordInteraction
  //   mockDiscordInteraction[0].channelId = 'wrongChannelId';
  //
  //   const response = await command.onAlbionScanCommand(dto, mockDiscordInteraction);
  //   const expectedResponse = `Please use the <#${scanChannelId}> channel to perform Scans.`;
  //
  //   expect(response).toBe(expectedResponse);
  //   expect(mockDiscordInteraction[0].channel.send).not.toHaveBeenCalled();
  //   expect(albionScanningService.startScan).not.toHaveBeenCalled();
  // });
  //
  // it('should handle when dryRun true', async () => {
  //   dto.dryRun = true;
  //   const response = await command.onAlbionScanCommand(dto, mockDiscordInteraction);
  //   const expectedResponse = 'Albion Scan initiated! [DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]';
  //
  //   expect(response).toBe(expectedResponse);
  // });
  //
  // it('should handle when dryRun false', async () => {
  //   dto.dryRun = false;
  //   const response = await command.onAlbionScanCommand(dto, mockDiscordInteraction);
  //   const expectedResponse = 'Albion Scan initiated!';
  //   expect(response).toBe(expectedResponse);
  //   expect(response).toBe(undefined);
  // });
});
