/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlbionContentRolesCommand } from './content-roles.command';
import { AlbionContentRoleService } from '../services/albion.content.role.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const scanChannelId = TestBootstrapper.mockConfig.discord.channels.albionScans;

describe('AlbionContentRolesCommand', () => {
  let command: AlbionContentRolesCommand;
  let albionContentRoleService: AlbionContentRoleService;
  let mockDiscordInteraction: any;

  beforeEach(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionContentRolesCommand,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: AlbionContentRoleService,
          useValue: { reconcile: jest.fn() },
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    command = moduleRef.get<AlbionContentRolesCommand>(AlbionContentRolesCommand);
    albionContentRoleService = moduleRef.get<AlbionContentRoleService>(AlbionContentRoleService);

    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(
      scanChannelId,
      TestBootstrapper.getMockDiscordUser(),
    );
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('should start the sweep when the channel is correct', async () => {
    await command.onAlbionContentRolesCommand({ dryRun: false }, mockDiscordInteraction);

    expect(mockDiscordInteraction[0].deferReply).toHaveBeenCalled();
    expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith('Starting Albion content role sweep...');
    expect(albionContentRoleService.reconcile).toHaveBeenCalledWith(expect.anything(), false);
  });

  it('should refuse to run outside the scans channel', async () => {
    mockDiscordInteraction[0].channelId = 'wrongChannelId';

    const response = await command.onAlbionContentRolesCommand({ dryRun: false }, mockDiscordInteraction);

    expect(response).toBe(`Please use the <#${scanChannelId}> channel to perform Scans.`);
    expect(mockDiscordInteraction[0].channel.send).not.toHaveBeenCalled();
    expect(albionContentRoleService.reconcile).not.toHaveBeenCalled();
  });

  it('should flag a dry run in the response', async () => {
    const response = await command.onAlbionContentRolesCommand({ dryRun: true }, mockDiscordInteraction);

    expect(albionContentRoleService.reconcile).toHaveBeenCalledWith(expect.anything(), true);
    expect(response).toBe('Albion content role sweep initiated! [DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]');
  });

  it('should default to a live run when the option is omitted', async () => {
    const response = await command.onAlbionContentRolesCommand({} as any, mockDiscordInteraction);

    expect(albionContentRoleService.reconcile).toHaveBeenCalledWith(expect.anything(), false);
    expect(response).toBe('Albion content role sweep initiated!');
  });
});
