/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Collection } from 'discord.js';
import { AlbionRankCountsService } from './albion.rank.counts.service';
import { DiscordService } from '../../discord/discord.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const guildId = TestBootstrapper.mockConfig.discord.guildId;
const roleMap = TestBootstrapper.mockConfig.albion.roleMap;
const archmage = roleMap[0].discordRoleId;
const graduate = roleMap[4].discordRoleId;
const disciple = roleMap[5].discordRoleId;

const createMember = (id: string, roleIds: string[], isBot = false) => ({
  id,
  displayName: `member-${id}`,
  user: { id, bot: isBot },
  roles: {
    cache: {
      has: (roleId: string) => roleIds.includes(roleId),
    },
  },
}) as any;

describe('AlbionRankCountsService', () => {
  let service: AlbionRankCountsService;
  let discordService: any;
  let members: Collection<string, any>;

  beforeEach(async () => {
    members = new Collection<string, any>();

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRankCountsService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: DiscordService,
          useValue: {
            getGuild: jest.fn().mockImplementation(() => ({
              id: guildId,
              members: { fetch: jest.fn().mockImplementation(() => members) },
            })),
          },
        },
      ],
    }).compile();

    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get(AlbionRankCountsService);
    discordService = moduleRef.get(DiscordService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should fetch every member of the configured guild', async () => {
    await service.getRankCounts(guildId);

    expect(discordService.getGuild).toHaveBeenCalledWith(guildId);
  });

  it('should return a count for every rank in the role map, ordered by priority', async () => {
    const counts = await service.getRankCounts(guildId);

    expect(counts.ranks.map((rank) => rank.name)).toEqual(roleMap.map((role) => role.name));
    expect(counts.ranks.map((rank) => rank.priority)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('should count the members holding each role', async () => {
    members.set('1', createMember('1', [archmage, graduate]));
    members.set('2', createMember('2', [graduate]));
    members.set('3', createMember('3', [disciple]));
    members.set('4', createMember('4', [disciple]));
    members.set('5', createMember('5', []));

    const counts = await service.getRankCounts(guildId);
    const byName = Object.fromEntries(counts.ranks.map((rank) => [rank.name, rank.count]));

    expect(byName['@ALB/Archmage']).toBe(1);
    expect(byName['@ALB/Graduate']).toBe(2);
    expect(byName['@ALB/Disciple']).toBe(2);
    expect(byName['@ALB/Magister']).toBe(0);
  });

  it('should count each member holding any rank only once', async () => {
    // Archmage keeps Graduate on promotion, so this member holds two rank roles
    members.set('1', createMember('1', [archmage, graduate]));
    members.set('2', createMember('2', [disciple]));
    members.set('3', createMember('3', []));

    const counts = await service.getRankCounts(guildId);

    expect(counts.anyRank).toBe(2);
  });

  it('should exclude bots from the counts', async () => {
    members.set('1', createMember('1', [disciple]));
    members.set('2', createMember('2', [disciple], true));

    const counts = await service.getRankCounts(guildId);
    const discipleCount = counts.ranks.find((rank) => rank.name === '@ALB/Disciple').count;

    expect(discipleCount).toBe(1);
    expect(counts.anyRank).toBe(1);
  });

  it('should report zeroes when nobody holds a rank', async () => {
    members.set('1', createMember('1', []));

    const counts = await service.getRankCounts(guildId);

    expect(counts.ranks.every((rank) => rank.count === 0)).toBe(true);
    expect(counts.anyRank).toBe(0);
  });

  it('should throw if the guild cannot be fetched', async () => {
    discordService.getGuild.mockRejectedValue(new Error('Could not find guild with ID 123'));

    await expect(service.getRankCounts(guildId)).rejects.toThrow('Could not find guild with ID 123');
  });

  describe('formatReport', () => {
    it('should render every rank and its count inside a code block', async () => {
      members.set('1', createMember('1', [archmage, graduate]));
      members.set('2', createMember('2', [disciple]));

      const report = service.formatReport(await service.getRankCounts(guildId));

      expect(report).toContain('## 📊 Albion rank numbers');
      expect(report).toContain('```');
      expect(report).toContain('@ALB/Archmage');
      expect(report).toContain('@ALB/Disciple');
      expect(report).toContain('Members holding **any** Albion rank: **2**');
    });

    it('should pad the rank names so the numbers line up', async () => {
      const report = service.formatReport(await service.getRankCounts(guildId));
      const lines = report.split('\n').filter((line) => line.startsWith('@ALB/'));
      const numberPositions = lines.map((line) => line.search(/\d/));

      expect(lines).toHaveLength(roleMap.length);
      expect(new Set(numberPositions).size).toBe(1);
    });
  });
});
