/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { MessageFlags } from 'discord.js';
import { AlbionSeedRankDatesCommand } from './seed-rank-dates.command';
import { AlbionRankProgressService } from '../services/albion.rank.progress.service';

describe('AlbionSeedRankDatesCommand', () => {
  let command: AlbionSeedRankDatesCommand;
  let rankProgressService: any;
  let interaction: any;

  const result = (overrides: any = {}) => ({
    registrations: 10,
    graduates: 4,
    adepts: 2,
    alreadySet: 1,
    notInServer: 3,
    dryRun: false,
    ...overrides,
  });

  beforeEach(async () => {
    rankProgressService = { seedExistingRanks: jest.fn().mockResolvedValue(result()) };
    interaction = {
      reply: jest.fn().mockResolvedValue(true),
      editReply: jest.fn().mockResolvedValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionSeedRankDatesCommand,
        { provide: AlbionRankProgressService, useValue: rankProgressService },
      ],
    }).compile();

    command = module.get<AlbionSeedRankDatesCommand>(AlbionSeedRankDatesCommand);
  });

  it('should be defined', () => {
    expect(command).toBeDefined();
  });

  it('replies ephemerally, since fetching every member blows the 3s window', async () => {
    await command.onSeedRankDatesCommand({} as any, [interaction] as never);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
  });

  // necord ignores DTO field initialisers, so an omitted option arrives as null
  it('defaults dry-run to false at the read site', async () => {
    await command.onSeedRankDatesCommand({} as any, [interaction] as never);

    expect(rankProgressService.seedExistingRanks).toHaveBeenCalledWith(false);
  });

  it('passes dry-run through when set', async () => {
    await command.onSeedRankDatesCommand({ dryRun: true } as any, [interaction] as never);

    expect(rankProgressService.seedExistingRanks).toHaveBeenCalledWith(true);
  });

  it('reports every counter back', async () => {
    await command.onSeedRankDatesCommand({} as any, [interaction] as never);

    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply).toContain('Registrations checked: **10**');
    expect(reply).toContain('Graduate dates set: **4**');
    expect(reply).toContain('Adept dates set: **2**');
    expect(reply).toContain('left alone: **1**');
    expect(reply).toContain('no longer in the server: **3**');
  });

  it('makes clear when nothing was written', async () => {
    rankProgressService.seedExistingRanks.mockResolvedValue(result({ dryRun: true }));

    await command.onSeedRankDatesCommand({ dryRun: true } as any, [interaction] as never);

    const reply = interaction.editReply.mock.calls[0][0];
    expect(reply).toContain('Dry run');
    expect(reply).toContain('nothing was written');
  });

  it('surfaces a failure instead of leaving the command hanging', async () => {
    rankProgressService.seedExistingRanks.mockRejectedValue(new Error('db down'));

    await command.onSeedRankDatesCommand({} as any, [interaction] as never);

    expect(interaction.editReply).toHaveBeenCalledWith(expect.stringContaining('db down'));
  });
});
