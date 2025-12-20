/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionForceRetryCommand } from './force-retry.command';
import { AlbionRegistrationRetryCronService } from '../services/albion.registration.retry.cron.service';

const createInteraction = () => {
  const interaction: any = {
    reply: jest.fn().mockResolvedValue(undefined),
    editReply: jest.fn().mockResolvedValue(undefined),
  };

  return interaction;
};

describe('AlbionForceRetryCommand', () => {
  let command: AlbionForceRetryCommand;
  let cron: { retryAlbionRegistrations: jest.Mock };

  beforeEach(async () => {
    cron = {
      retryAlbionRegistrations: jest.fn().mockResolvedValue(undefined),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionForceRetryCommand,
        {
          provide: AlbionRegistrationRetryCronService,
          useValue: cron,
        },
      ],
    }).compile();

    command = moduleRef.get(AlbionForceRetryCommand);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  it('should call retryAlbionRegistrations and report success', async () => {
    const interaction = createInteraction();

    await command.onAlbionForceRetry([interaction]);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: '⏳ Running Albion registration retry now...' }),
    );
    expect(cron.retryAlbionRegistrations).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith('✅ Albion registration retry run complete.');
  });

  it('should report failure when retryAlbionRegistrations throws', async () => {
    cron.retryAlbionRegistrations = jest.fn().mockRejectedValue(new Error('boom'));

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionForceRetryCommand,
        {
          provide: AlbionRegistrationRetryCronService,
          useValue: cron,
        },
      ],
    }).compile();

    command = moduleRef.get(AlbionForceRetryCommand);

    const interaction = createInteraction();

    await command.onAlbionForceRetry([interaction]);

    expect(interaction.reply).toHaveBeenCalled();
    expect(cron.retryAlbionRegistrations).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith('⛔️ Albion registration retry run failed. Check logs.');
  });
});

