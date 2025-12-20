/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { AlbionForceRetryCommand } from './force-retry.command';
import { AlbionRegistrationRetryCronService } from '../services/albion.registration.retry.cron.service';
import { ConfigService } from '@nestjs/config';

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

  const config: Pick<ConfigService, 'get'> = {
    get: jest.fn().mockImplementation((key: string) => {
      if (key === 'discord.channels.albionRegistration') {
        return '123';
      }
      if (key === 'discord.devUserId') {
        return '999';
      }
      return undefined;
    }),
  };

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
        {
          provide: ConfigService,
          useValue: config,
        },
      ],
    }).compile();

    command = moduleRef.get(AlbionForceRetryCommand);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should call retryAlbionRegistrations and report success', async () => {
    const interaction = createInteraction();

    await command.onAlbionForceRetry([interaction]);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '⏳ Running Albion registration retry now (see <#123>)...',
      }),
    );
    expect(cron.retryAlbionRegistrations).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(
      '✅ Albion registration retry run complete. <#123>',
    );
  });

  it('should report failure when retryAlbionRegistrations throws', async () => {
    cron.retryAlbionRegistrations.mockRejectedValueOnce(new Error('boom'));

    const interaction = createInteraction();

    await command.onAlbionForceRetry([interaction]);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: '⏳ Running Albion registration retry now (see <#123>)...',
      }),
    );
    expect(cron.retryAlbionRegistrations).toHaveBeenCalledTimes(1);
    expect(interaction.editReply).toHaveBeenCalledWith(
      '⛔️ Albion registration retry run failed. Pinging <@999>!',
    );
  });
});
