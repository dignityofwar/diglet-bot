import { Test } from '@nestjs/testing';
import { ThanosSnapCommand } from './thanos.snap.command';
import { PurgeService } from '../services/purge.service';
import { ChatInputCommandInteraction } from 'discord.js';
import { DryRunDto } from '../dto/dry.run.dto';
import { TestBootstrapper } from '../../test.bootstrapper';
import { ReflectMetadataProvider } from '@discord-nestjs/core';

describe('ThanosSnapCommand', () => {
  let command: ThanosSnapCommand;
  let purgeService: PurgeService;

  const mockPurgeService = {
    startPurge: jest.fn(),
  };

  const mockDiscordUser = TestBootstrapper.getMockDiscordUser();

  const mockInteraction = TestBootstrapper.getMockDiscordInteraction('12345', mockDiscordUser) as unknown as ChatInputCommandInteraction[];

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ThanosSnapCommand,
        ReflectMetadataProvider,
        {
          provide: PurgeService,
          useValue: mockPurgeService,
        },
      ],
    }).compile();

    command = moduleRef.get<ThanosSnapCommand>(ThanosSnapCommand);
    purgeService = moduleRef.get<PurgeService>(PurgeService);

    jest.spyOn(command['logger'], 'error');
    jest.spyOn(command['logger'], 'warn');
    jest.spyOn(command['logger'], 'log');
    jest.spyOn(command['logger'], 'debug');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  describe('onThanosSnapCommand', () => {
    it('should log the execution of the command', async () => {
      const dto: DryRunDto = { dryRun: false };

      await command.onThanosSnapCommand(dto, mockInteraction);

      expect(command['logger'].log).toHaveBeenCalledWith('Executing Thanos Snap Command');
      expect(mockInteraction[0].reply).toHaveBeenCalledWith('I am... inevitable.');
      expect(purgeService.startPurge).toHaveBeenCalled();
    });

    it('should send a dry run message if dryRun is true', async () => {
      const dto: DryRunDto = { dryRun: true };

      await command.onThanosSnapCommand(dto, mockInteraction);

      expect(mockInteraction[0].reply).toHaveBeenCalledWith('I am... inevitable.');
      expect(mockInteraction[0].channel.send).toHaveBeenCalledWith('## This is a dry run! No members will be kicked!');
      expect(purgeService.startPurge).toHaveBeenCalled();
    });

    it('should send a gif and start the purge', async () => {
      const dto: DryRunDto = { dryRun: false };

      await command.onThanosSnapCommand(dto, mockInteraction);

      expect(mockInteraction[0].channel.send).toHaveBeenCalledWith('https://media.giphy.com/media/ie76dJeem4xBDcf83e/giphy.gif');
      expect(purgeService.startPurge).toHaveBeenCalled();
    });
  });
});
