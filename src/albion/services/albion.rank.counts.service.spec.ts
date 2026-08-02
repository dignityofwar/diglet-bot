/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Collection, Role, Snowflake } from 'discord.js';
import { AlbionRankCountsService } from './albion.rank.counts.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { DiscordService } from '../../discord/discord.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const guildId = TestBootstrapper.mockConfig.discord.guildId;
const albionGuildId = TestBootstrapper.mockConfig.albion.guildId;
const roleMap = TestBootstrapper.mockConfig.albion.roleMap;
const archmage = roleMap[0].discordRoleId;
const graduate = roleMap[4].discordRoleId;
const disciple = roleMap[5].discordRoleId;

const dungeonsRoleId = '900000000000000001';
const factionWarfareRoleId = '900000000000000002';

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

const createRoles = (roles: Array<{ id: string, name: string }>) => {
  const collection = new Collection<Snowflake, Role>();
  roles.forEach((role) => collection.set(role.id, role as Role));
  return collection;
};

const defaultRoles = () => createRoles([
  { id: '000000000000000000', name: '@everyone' },
  { id: archmage, name: '@ALB/Archmage' },
  { id: disciple, name: '@ALB/Disciple' },
  { id: dungeonsRoleId, name: 'ALB/Dungeons' },
  { id: factionWarfareRoleId, name: 'ALB/FactionWarfare' },
  { id: '900000000000000003', name: 'Rec/BestGameEver' },
  { id: '900000000000000004', name: 'Albion Online' },
]);

describe('AlbionRankCountsService', () => {
  let service: AlbionRankCountsService;
  let discordService: any;
  let registrationsRepository: any;
  let members: Collection<string, any>;
  let roles: Collection<Snowflake, Role>;

  beforeEach(async () => {
    members = new Collection<string, any>();
    roles = defaultRoles();
    registrationsRepository = TestBootstrapper.getMockEntityRepo();
    registrationsRepository.find.mockResolvedValue([]);

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
            getAllRolesFromGuild: jest.fn().mockImplementation(() => roles),
          },
        },
        {
          provide: getRepositoryToken(AlbionRegistrationsEntity),
          useValue: registrationsRepository,
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

  const registerMembers = (discordIds: string[]) => {
    registrationsRepository.find.mockResolvedValue(
      discordIds.map((discordId) => ({ discordId })),
    );
  };

  describe('ranks', () => {
    it('should fetch every member of the configured guild', async () => {
      await service.getRankCounts(guildId);

      expect(discordService.getGuild).toHaveBeenCalledWith(guildId);
    });

    it('should return a count for every rank in the role map, ordered by priority', async () => {
      const counts = await service.getRankCounts(guildId);

      expect(counts.ranks.map((rank) => rank.name)).toEqual(roleMap.map((role) => role.name));
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

    it('should count ranks regardless of whether the member is registered', async () => {
      members.set('1', createMember('1', [disciple]));
      members.set('2', createMember('2', [disciple]));
      registerMembers(['1']);

      const counts = await service.getRankCounts(guildId);
      const discipleCount = counts.ranks.find((rank) => rank.name === '@ALB/Disciple').count;

      expect(discipleCount).toBe(2);
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
  });

  describe('content roles', () => {
    it('should fetch the roles before the members, so member role caches are populated', async () => {
      const guild = { id: guildId, members: { fetch: jest.fn().mockResolvedValue(members) } };
      discordService.getGuild.mockResolvedValue(guild);

      await service.getRankCounts(guildId);

      expect(discordService.getAllRolesFromGuild).toHaveBeenCalledWith(guild);
      expect(discordService.getAllRolesFromGuild.mock.invocationCallOrder[0])
        .toBeLessThan(guild.members.fetch.mock.invocationCallOrder[0]);
    });

    it('should find ALB roles that are not ranks', async () => {
      const counts = await service.getRankCounts(guildId);

      expect(counts.content.map((role) => role.name).sort()).toEqual([
        'ALB/Dungeons',
        'ALB/FactionWarfare',
      ]);
    });

    it('should not treat rank roles or other prefixes as content roles', async () => {
      const contentNames = (await service.getRankCounts(guildId)).content.map((role) => role.name);

      expect(contentNames).not.toContain('@ALB/Archmage');
      expect(contentNames).not.toContain('@ALB/Disciple');
      expect(contentNames).not.toContain('Rec/BestGameEver');
      expect(contentNames).not.toContain('Albion Online');
      expect(contentNames).not.toContain('@everyone');
    });

    it('should treat an ALB role named with the mention prefix as content', async () => {
      roles = createRoles([{ id: dungeonsRoleId, name: '@ALB/Dungeons' }]);

      const counts = await service.getRankCounts(guildId);

      expect(counts.content.map((role) => role.name)).toEqual(['@ALB/Dungeons']);
    });

    it('should only count members who hold the role AND have a registration', async () => {
      members.set('1', createMember('1', [dungeonsRoleId]));
      members.set('2', createMember('2', [dungeonsRoleId]));
      members.set('3', createMember('3', [dungeonsRoleId]));
      registerMembers(['1', '3', '999']); // 999 has since left the server

      const counts = await service.getRankCounts(guildId);
      const dungeons = counts.content.find((role) => role.name === 'ALB/Dungeons');

      expect(dungeons.count).toBe(2);
    });

    it('should look up registrations for the configured Albion guild', async () => {
      await service.getRankCounts(guildId);

      expect(registrationsRepository.find).toHaveBeenCalledWith({ guildId: albionGuildId });
    });

    it('should exclude registered bots from content counts', async () => {
      members.set('1', createMember('1', [dungeonsRoleId], true));
      registerMembers(['1']);

      const counts = await service.getRankCounts(guildId);
      const dungeons = counts.content.find((role) => role.name === 'ALB/Dungeons');

      expect(dungeons.count).toBe(0);
    });

    it('should sort content roles by count, then name', async () => {
      members.set('1', createMember('1', [factionWarfareRoleId]));
      members.set('2', createMember('2', [factionWarfareRoleId]));
      members.set('3', createMember('3', [dungeonsRoleId]));
      registerMembers(['1', '2', '3']);

      const counts = await service.getRankCounts(guildId);

      expect(counts.content.map((role) => role.name)).toEqual([
        'ALB/FactionWarfare',
        'ALB/Dungeons',
      ]);
    });

    it('should count the registered members still in the server', async () => {
      members.set('1', createMember('1', []));
      members.set('2', createMember('2', []));
      members.set('3', createMember('3', [], true));
      registerMembers(['1', '2', '3', '999']);

      const counts = await service.getRankCounts(guildId);

      expect(counts.registered).toBe(2);
    });

    it('should cope with a guild that has no content roles', async () => {
      roles = createRoles([{ id: archmage, name: '@ALB/Archmage' }]);

      const counts = await service.getRankCounts(guildId);

      expect(counts.content).toEqual([]);
    });
  });

  it('should throw if the guild cannot be fetched', async () => {
    discordService.getGuild.mockRejectedValue(new Error('Could not find guild with ID 123'));

    await expect(service.getRankCounts(guildId)).rejects.toThrow('Could not find guild with ID 123');
  });

  describe('formatReport', () => {
    it('should render both sections with their counts inside code blocks', async () => {
      members.set('1', createMember('1', [archmage, graduate]));
      members.set('2', createMember('2', [disciple, dungeonsRoleId]));
      registerMembers(['2']);

      const report = service.formatReport(await service.getRankCounts(guildId));

      expect(report).toContain('## 📊 Albion role numbers');
      expect(report).toContain('### Ranks');
      expect(report).toContain('@ALB/Archmage');
      expect(report).toContain('Members holding **any** Albion rank: **2**');
      expect(report).toContain('### Content roles');
      expect(report).toContain('ALB/Dungeons');
      expect(report).toContain('Registered members in the server: **1**');
    });

    it('should say so when there are no content roles', async () => {
      roles = createRoles([{ id: archmage, name: '@ALB/Archmage' }]);

      const report = service.formatReport(await service.getRankCounts(guildId));

      expect(report).toContain('_No ALB content roles found._');
    });

    it('should pad the role names so the numbers line up', async () => {
      const report = service.formatReport(await service.getRankCounts(guildId));
      const rankLines = report.split('\n').filter((line) => line.startsWith('@ALB/'));
      const contentLines = report.split('\n').filter((line) => line.startsWith('ALB/'));

      expect(rankLines).toHaveLength(roleMap.length);
      expect(new Set(rankLines.map((line) => line.search(/\d/))).size).toBe(1);
      expect(contentLines).toHaveLength(2);
      expect(new Set(contentLines.map((line) => line.search(/\d/))).size).toBe(1);
    });
  });

  describe('chunkReport', () => {
    it('should leave a report that fits in one message alone', () => {
      expect(service.chunkReport('a short report')).toEqual(['a short report']);
    });

    it('should split an oversized report on line boundaries', () => {
      const line = 'ALB/SomeVeryLongContentRoleName    12';
      const report = Array.from({ length: 200 }, () => line).join('\n');

      const chunks = service.chunkReport(report);

      expect(chunks.length).toBeGreaterThan(1);
      chunks.forEach((chunk) => expect(chunk.length).toBeLessThanOrEqual(2000));
      expect(chunks.join('\n')).toBe(report);
    });
  });
});
