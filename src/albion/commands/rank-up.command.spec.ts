/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { MessageFlags } from 'discord.js';
import { AlbionRankUpCommand } from './rank-up.command';
import { AlbionRankUpService } from '../services/albion.rank.up.service';

describe('AlbionRankUpCommand', () => {
  let command: AlbionRankUpCommand;
  let rankUpService: any;
  let interaction: any;

  beforeEach(async () => {
    rankUpService = {
      handleRankUpRequest: jest.fn().mockResolvedValue({ ok: true, reply: '✅ Sent!' }),
    };

    interaction = {
      member: { id: 'candidate' },
      reply: jest.fn().mockResolvedValue(true),
      editReply: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRankUpCommand,
        { provide: AlbionRankUpService, useValue: rankUpService },
      ],
    }).compile();

    command = module.get<AlbionRankUpCommand>(AlbionRankUpCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  // Every response is private to the requester
  it('replies ephemerally', async () => {
    await command.onAlbionRankUpCommand([interaction] as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });

  it('edits in whatever the service decided', async () => {
    rankUpService.handleRankUpRequest.mockResolvedValue({ ok: false, reply: '⛔ Too new' });

    await command.onAlbionRankUpCommand([interaction] as never);

    expect(interaction.editReply).toHaveBeenCalledWith('⛔ Too new');
  });

  it('reports an unexpected failure rather than leaving the command hanging', async () => {
    rankUpService.handleRankUpRequest.mockRejectedValue(new Error('boom'));

    await command.onAlbionRankUpCommand([interaction] as never);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('boom'));
  });
});
