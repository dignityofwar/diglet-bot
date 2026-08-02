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
    { name: '@ALB/Archmage', discordRoleId: '1', priority: 1, count: 1 },
    { name: '@ALB/Disciple', discordRoleId: '2', priority: 6, count: 42 },
  ],
  anyRank: 43,
};

const createInteraction = () => ({
  guildId: 'discord-guild-id',
  deferred: true,
  replied: false,
  deferReply: jest.fn().mockResolvedValue(undefined),
  editReply: jest.fn().mockResolvedValue(undefined),
  reply: jest.fn().mockResolvedValue(undefined),
}) as any;

describe('AlbionRankCountsCommand', () => {
  let command: AlbionRankCountsCommand;
  let rankCountsService: any;
  let interaction: any;

  beforeEach(async () => {
    rankCountsService = {
      getRankCounts: jest.fn().mockResolvedValue(counts),
      formatReport: jest.fn().mockReturnValue('## 📊 Albion rank numbers'),
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
    expect(result).toBe('## 📊 Albion rank numbers');
    expect(interaction.editReply).toHaveBeenCalledWith('## 📊 Albion rank numbers');
  });

  it('should report the error when the counts cannot be gathered', async () => {
    rankCountsService.getRankCounts.mockRejectedValue(new Error('Could not find guild with ID 123'));

    const result = await command.onAlbionRankCountsCommand([interaction]);

    expect(result).toBe('⛔️ **ERROR:** Could not find guild with ID 123');
    expect(rankCountsService.formatReport).not.toHaveBeenCalled();
  });
});
