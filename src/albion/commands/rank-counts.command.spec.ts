/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { MessageFlags } from 'discord.js';
import { AlbionRankCountsCommand } from './rank-counts.command';
import { AlbionRankCountsService } from '../services/albion.rank.counts.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const guildId = TestBootstrapper.mockConfig.discord.guildId;
const counts = {
  ranks: [
    { name: '@ALB/Archmage', discordRoleId: '1', count: 1 },
    { name: '@ALB/Disciple', discordRoleId: '2', count: 42 },
  ],
  content: [
    { name: 'ALB/Dungeons', discordRoleId: '3', count: 20 },
  ],
  anyRank: 43,
  registered: 40,
};

const createInteraction = () => ({
  guildId: 'discord-guild-id',
  deferred: true,
  replied: false,
  deferReply: jest.fn().mockResolvedValue(undefined),
  editReply: jest.fn().mockResolvedValue(undefined),
  reply: jest.fn().mockResolvedValue(undefined),
  followUp: jest.fn().mockResolvedValue(undefined),
}) as any;

describe('AlbionRankCountsCommand', () => {
  let command: AlbionRankCountsCommand;
  let rankCountsService: any;
  let interaction: any;

  beforeEach(async () => {
    rankCountsService = {
      getRankCounts: jest.fn().mockResolvedValue(counts),
      formatReport: jest.fn().mockReturnValue('## 📊 Albion role numbers'),
      chunkReport: jest.fn().mockImplementation((report: string) => [report]),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRankCountsCommand,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: AlbionRankCountsService,
          useValue: rankCountsService,
        },
      ],
    }).compile();

    TestBootstrapper.setupConfig(moduleRef);

    command = moduleRef.get(AlbionRankCountsCommand);
    interaction = createInteraction();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should defer the reply ephemerally before doing any work', async () => {
    await command.onAlbionRankCountsCommand([interaction]);

    expect(interaction.deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
  });

  it('should reply with the formatted report for the configured guild', async () => {
    const result = await command.onAlbionRankCountsCommand([interaction]);

    expect(rankCountsService.getRankCounts).toHaveBeenCalledWith(guildId);
    expect(rankCountsService.formatReport).toHaveBeenCalledWith(counts);
    expect(result).toBe('## 📊 Albion role numbers');
    expect(interaction.editReply).toHaveBeenCalledWith('## 📊 Albion role numbers');
    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('should follow up ephemerally with the rest of an oversized report', async () => {
    rankCountsService.chunkReport.mockReturnValue(['first chunk', 'second chunk', 'third chunk']);

    await command.onAlbionRankCountsCommand([interaction]);

    expect(interaction.editReply).toHaveBeenCalledWith('first chunk');
    expect(interaction.followUp).toHaveBeenCalledTimes(2);
    expect(interaction.followUp).toHaveBeenNthCalledWith(1, {
      content: 'second chunk',
      flags: MessageFlags.Ephemeral,
    });
    expect(interaction.followUp).toHaveBeenNthCalledWith(2, {
      content: 'third chunk',
      flags: MessageFlags.Ephemeral,
    });
  });

  it('should report the error when the counts cannot be gathered', async () => {
    rankCountsService.getRankCounts.mockRejectedValue(new Error('Could not find guild with ID 123'));

    const result = await command.onAlbionRankCountsCommand([interaction]);

    expect(result).toBe('⛔️ **ERROR:** Could not find guild with ID 123');
    expect(rankCountsService.formatReport).not.toHaveBeenCalled();
  });
});
