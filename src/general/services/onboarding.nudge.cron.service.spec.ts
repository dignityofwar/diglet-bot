import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { Collection, GuildMember, TextChannel } from 'discord.js';
import { DiscordService } from '../../discord/discord.service';
import { OnboardingNudgeEntity } from '../../database/entities/onboarding.nudge.entity';
import { OnboardingNudgeCronService } from './onboarding.nudge.cron.service';

const guildId = 'guild-1';
const onboardedRoleId = 'role-onboarded';
const otherRoleId = 'role-albion';
const chitChatId = 'channel-chit-chat';
const botJobsId = 'channel-bot-jobs';
const rolesChannelId = 'channel-roles';

const configValues = {
  'discord.guildId': guildId,
  'discord.channels.chitChat': chitChatId,
  'discord.channels.botJobs': botJobsId,
  'discord.channels.roleSelection': rolesChannelId,
};

const daysAgo = (days: number): Date => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

interface MemberOptions {
  id: string;
  roleIds?: string[];
  joinedAt?: Date | null;
  bot?: boolean;
}

interface MockRole {
  id: string;
  name?: string;
}

interface MockMember {
  id: string;
  displayName: string;
  joinedAt: Date | null;
  user: { bot: boolean };
  roles: { cache: Collection<string, MockRole> };
}

interface MockChannel {
  id: string;
  send: jest.Mock;
  isTextBased: jest.Mock;
}

// @everyone shares the guild's ID, so every member carries it whether they chose a role or not
const mockMember = ({ id, roleIds = [onboardedRoleId], joinedAt = daysAgo(10), bot = false }: MemberOptions): MockMember => ({
  id,
  displayName: `nick-${id}`,
  joinedAt,
  user: { bot },
  roles: {
    cache: new Collection<string, MockRole>([guildId, ...roleIds].map(roleId => [roleId, { id: roleId }])),
  },
});

const roleId = (index: number): string => (index === 0 ? onboardedRoleId : `${onboardedRoleId}-${index}`);

const mockRoles = (names: string[] = ['Onboarded']): Collection<string, MockRole> =>
  new Collection<string, MockRole>(names.map((name, index) => [roleId(index), { id: roleId(index), name }]));

describe('OnboardingNudgeCronService', () => {
  let service: OnboardingNudgeCronService;
  let discordService: DiscordService;
  let configService: ConfigService;
  let nudgeRepository: { find: jest.Mock, getEntityManager: jest.Mock };
  let execute: jest.Mock;
  let chitChatChannel: MockChannel;
  let botJobsChannel: MockChannel;

  const setMembers = (members: MockMember[]) => {
    (discordService.getGuild as jest.Mock).mockResolvedValue({
      id: guildId,
      members: {
        fetch: jest.fn().mockResolvedValue(new Collection<string, MockMember>(members.map(member => [member.id, member]))),
      },
    });
  };

  // Skips onApplicationBootstrap's Discord calls to get straight at the run behaviour
  const enable = () => {
    service['enabled'] = true;
    service['guildId'] = guildId;
    service['roleSelectionChannelId'] = rolesChannelId;
    service['chitChatChannel'] = chitChatChannel as unknown as TextChannel;
    service['botJobsChannel'] = botJobsChannel as unknown as TextChannel;
  };

  beforeEach(async () => {
    execute = jest.fn().mockResolvedValue(undefined);

    nudgeRepository = {
      find: jest.fn().mockResolvedValue([]),
      getEntityManager: jest.fn().mockReturnValue({
        getConnection: jest.fn().mockReturnValue({ execute }),
      }),
    };

    chitChatChannel = {
      id: chitChatId,
      send: jest.fn().mockResolvedValue({}),
      isTextBased: jest.fn().mockReturnValue(true),
    };
    botJobsChannel = {
      id: botJobsId,
      send: jest.fn().mockResolvedValue({}),
      isTextBased: jest.fn().mockReturnValue(true),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingNudgeCronService,
        {
          provide: getRepositoryToken(OnboardingNudgeEntity),
          useValue: nudgeRepository,
        },
        {
          provide: DiscordService,
          useValue: {
            getGuild: jest.fn(),
            getAllRolesFromGuild: jest.fn().mockResolvedValue(mockRoles()),
            getTextChannel: jest.fn().mockImplementation(async (id: string) =>
              (id === chitChatId ? chitChatChannel : botJobsChannel)),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockImplementation((key: string) => configValues[key]),
          },
        },
        Logger,
      ],
    }).compile();

    service = module.get<OnboardingNudgeCronService>(OnboardingNudgeCronService);
    discordService = module.get<DiscordService>(DiscordService);
    configService = module.get<ConfigService>(ConfigService);

    setMembers([]);
  });

  describe('onApplicationBootstrap', () => {
    it('resolves both channels and enables the job', async () => {
      await service.onApplicationBootstrap();

      expect(discordService.getTextChannel).toHaveBeenCalledWith(chitChatId);
      expect(discordService.getTextChannel).toHaveBeenCalledWith(botJobsId);
      expect(service['enabled']).toBe(true);
    });

    it.each([
      'discord.guildId',
      'discord.channels.chitChat',
      'discord.channels.botJobs',
      'discord.channels.roleSelection',
    ])('stays disabled without throwing when %s is missing', async (missingKey) => {
      (configService.get as jest.Mock).mockImplementation((key: string) =>
        (key === missingKey ? undefined : configValues[key]));

      await expect(service.onApplicationBootstrap()).resolves.not.toThrow();

      expect(service['enabled']).toBe(false);
      expect(discordService.getTextChannel).not.toHaveBeenCalled();
    });

    it('stays disabled when a channel cannot be fetched', async () => {
      (discordService.getTextChannel as jest.Mock).mockRejectedValue(new Error('Unknown Channel'));

      await expect(service.onApplicationBootstrap()).resolves.not.toThrow();

      expect(service['enabled']).toBe(false);
    });

    it('stays disabled when a channel is not text based', async () => {
      chitChatChannel.isTextBased.mockReturnValue(false);

      await service.onApplicationBootstrap();

      expect(service['enabled']).toBe(false);
    });
  });

  describe('findCandidates', () => {
    beforeEach(() => enable());

    it('returns members holding only Onboarded, longest waiting first', async () => {
      setMembers([
        mockMember({ id: 'recent', joinedAt: daysAgo(5) }),
        mockMember({ id: 'oldest', joinedAt: daysAgo(50) }),
        mockMember({ id: 'middle', joinedAt: daysAgo(20) }),
      ]);

      const candidates = await service.findCandidates();

      expect(candidates.map((member: GuildMember) => member.id)).toEqual(['oldest', 'middle', 'recent']);
    });

    it.each([
      ['a bot', { id: 'bot', bot: true }],
      ['a member holding another role', { id: 'engaged', roleIds: [onboardedRoleId, otherRoleId] }],
      ['a member without the Onboarded role', { id: 'not-onboarded', roleIds: [otherRoleId] }],
      ['a member still inside the grace period', { id: 'fresh', joinedAt: daysAgo(1) }],
      ['a member with no join date', { id: 'partial', joinedAt: null }],
    ])('excludes %s', async (_label, options: MemberOptions) => {
      setMembers([mockMember(options)]);

      expect(await service.findCandidates()).toEqual([]);
    });

    it('excludes members already recorded as nudged', async () => {
      setMembers([mockMember({ id: 'done' }), mockMember({ id: 'todo' })]);
      nudgeRepository.find.mockResolvedValue([{ discordId: 'done' }]);

      const candidates = await service.findCandidates();

      expect(candidates.map(member => member.id)).toEqual(['todo']);
    });

    it('does not query the nudge table when nobody is eligible', async () => {
      setMembers([mockMember({ id: 'fresh', joinedAt: daysAgo(1) })]);

      await service.findCandidates();

      expect(nudgeRepository.find).not.toHaveBeenCalled();
    });

    it.each([
      ['no', []],
      ['two', ['Onboarded', 'Onboarded']],
    ])('throws when the guild has %s Onboarded roles', async (_label, names: string[]) => {
      (discordService.getAllRolesFromGuild as jest.Mock).mockResolvedValue(mockRoles(names));

      await expect(service.findCandidates()).rejects.toThrow(/Expected exactly one "Onboarded" role/);
    });
  });

  describe('run', () => {
    beforeEach(() => enable());

    it('reports without posting or recording on a dry run', async () => {
      setMembers([mockMember({ id: 'todo' })]);

      const [summary] = await service.run(true);

      expect(summary).toContain('**[DRY RUN]** 1 member(s) are sat on only the Onboarded role');
      expect(summary).toContain('nick-todo');
      expect(chitChatChannel.send).not.toHaveBeenCalled();
      expect(execute).not.toHaveBeenCalled();
    });

    it('lists everyone eligible as well as the batch that would go now', async () => {
      setMembers(Array.from({ length: 8 }, (_, index) => mockMember({ id: `m${index}`, joinedAt: daysAgo(20 + index) })));

      const report = (await service.run(true)).join('\n');

      expect(report).toContain('Would be nudged now (5, 3 left over):');
      expect(report).toContain('Everyone eligible (8), longest waiting first:');

      // The five oldest appear twice, once per section; the other three only in the full list
      expect(report.match(/nick-m7/g)).toHaveLength(2);
      expect(report.match(/nick-m0/g)).toHaveLength(1);

      // Every eligible member is named, and each carries their ID and how long they have waited
      for (let index = 0; index < 8; index++) {
        expect(report).toContain(`**nick-m${index}** (\`m${index}\`) — joined <t:`);
      }
    });

    it('names people without mentioning them, so the report cannot become the nudge', async () => {
      setMembers([mockMember({ id: 'todo' })]);

      expect((await service.run(true)).join('\n')).not.toContain('<@');
    });

    it('splits a long roster across messages and says what it dropped', async () => {
      setMembers(Array.from({ length: 400 }, (_, index) => mockMember({ id: `m${index}`, joinedAt: daysAgo(410 - index) })));

      const messages = await service.run(true);

      expect(messages).toHaveLength(4);
      expect(messages.every(message => message.length <= 2000)).toBe(true);
      expect(messages.at(-1)).toMatch(/…and \d+ more lines not shown\./);
    });

    it('posts one message with an explicit mention allowlist, then records and logs it', async () => {
      setMembers([mockMember({ id: 'a', joinedAt: daysAgo(20) }), mockMember({ id: 'b', joinedAt: daysAgo(10) })]);

      const [summary] = await service.run();

      expect(chitChatChannel.send).toHaveBeenCalledTimes(1);
      const payload = chitChatChannel.send.mock.calls[0][0];
      expect(payload.content).toContain('<@a> <@b>');
      expect(payload.content).toContain(`<#${rolesChannelId}>`);
      expect(payload.allowedMentions).toEqual({ users: ['a', 'b'] });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(execute.mock.calls[0][1]).toEqual(expect.arrayContaining(['a', 'nick-a', 'b', 'nick-b']));

      // Recording before sending would mark people nudged and then never nudge them
      expect(chitChatChannel.send.mock.invocationCallOrder[0])
        .toBeLessThan(execute.mock.invocationCallOrder[0]);

      // The audit log names people, so it must not be able to ping them a second time
      expect(botJobsChannel.send).toHaveBeenCalledWith({
        content: summary,
        allowedMentions: { users: [] },
      });
      expect(summary).toContain('Nudged 2 member(s)');
      expect(summary).toContain('0 still waiting');
    });

    it('nudges at most five members per run and says how many are left', async () => {
      setMembers(Array.from({ length: 8 }, (_, index) => mockMember({ id: `m${index}`, joinedAt: daysAgo(20 + index) })));

      const [summary] = await service.run();

      expect(chitChatChannel.send.mock.calls[0][0].allowedMentions.users).toHaveLength(5);
      expect(summary).toContain('3 still waiting');
    });

    it('clears the whole backlog when told to send them all', async () => {
      setMembers(Array.from({ length: 8 }, (_, index) => mockMember({ id: `m${index}`, joinedAt: daysAgo(20 + index) })));

      const [summary] = await service.run(false, true);

      expect(chitChatChannel.send).toHaveBeenCalledTimes(1);
      expect(chitChatChannel.send.mock.calls[0][0].allowedMentions.users).toHaveLength(8);
      expect(summary).toContain('Nudged 8 member(s)');
      expect(summary).toContain('0 still waiting');
    });

    it('splits a backlog too big for one message, recording each block as it goes', async () => {
      setMembers(Array.from({ length: 60 }, (_, index) => mockMember({ id: `m${index}`, joinedAt: daysAgo(70 - index) })));

      const [summary] = await service.run(false, true);

      // 25 mentions a message, so 60 members is three sends and three recordings
      expect(chitChatChannel.send).toHaveBeenCalledTimes(3);
      expect(execute).toHaveBeenCalledTimes(3);
      expect(chitChatChannel.send.mock.calls.every(([payload]) => payload.content.length <= 2000)).toBe(true);
      expect(chitChatChannel.send.mock.calls.flatMap(([payload]) => payload.allowedMentions.users)).toHaveLength(60);
      expect(summary).toContain('across 3 messages');
      expect(summary).toContain('0 still waiting');
    });

    it('stops sending the moment a block cannot be recorded', async () => {
      setMembers(Array.from({ length: 60 }, (_, index) => mockMember({ id: `m${index}`, joinedAt: daysAgo(70 - index) })));
      execute.mockRejectedValueOnce(new Error('Deadlock found'));

      const [summary] = await service.run(false, true);

      // Otherwise a broken database means the whole backlog is pinged and none of it remembered
      expect(chitChatChannel.send).toHaveBeenCalledTimes(1);
      expect(summary).toContain('Nudged 25 of 60 member(s)');
      expect(summary).toContain('stopped because the nudge could not be recorded');
    });

    it('stops sending when Discord refuses a block, keeping what it already recorded', async () => {
      setMembers(Array.from({ length: 60 }, (_, index) => mockMember({ id: `m${index}`, joinedAt: daysAgo(70 - index) })));
      chitChatChannel.send
        .mockResolvedValueOnce({})
        .mockRejectedValueOnce(new Error('Missing Permissions'));

      const [summary] = await service.run(false, true);

      expect(execute).toHaveBeenCalledTimes(1);
      expect(summary).toContain('Nudged 25 of 60 member(s)');
      expect(summary).toContain('Discord refused the message: Missing Permissions');
    });

    it('shows one combined list on a dry run that would clear the backlog', async () => {
      setMembers(Array.from({ length: 8 }, (_, index) => mockMember({ id: `m${index}`, joinedAt: daysAgo(20 + index) })));

      const report = (await service.run(true, true)).join('\n');

      expect(report).toContain('**All 8 would be nudged now**, longest waiting first:');
      expect(report).not.toContain('Everyone eligible');
      // Named once, not once per section
      expect(report.match(/nick-m7/g)).toHaveLength(1);
    });

    it('posts nothing when nobody is eligible', async () => {
      const [summary] = await service.run();

      expect(summary).toBe('No members are sat on only the Onboarded role right now.');
      expect(chitChatChannel.send).not.toHaveBeenCalled();
      expect(botJobsChannel.send).not.toHaveBeenCalled();
    });

    it('flags a failed recording so the repeat nudge is not a surprise', async () => {
      setMembers([mockMember({ id: 'a' })]);
      execute.mockRejectedValue(new Error('Deadlock found'));

      const [summary] = await service.run();

      expect(summary).toContain('failed to record it');
      expect(summary).toContain('stopped because the nudge could not be recorded');
      expect(botJobsChannel.send).toHaveBeenCalled();
      expect(service['consecutiveFailures']).toBe(1);
    });

    it('stands the job down after repeated recording failures', async () => {
      setMembers([mockMember({ id: 'a' })]);
      execute.mockRejectedValue(new Error('Deadlock found'));

      await service.run();
      const [summary] = await service.run();

      // The repeat ping is exactly what standing down exists to stop, so prove it happens twice
      expect(chitChatChannel.send).toHaveBeenCalledTimes(2);
      expect(service['consecutiveFailures']).toBe(2);
      expect(summary).toContain('Standing the job down');

      // ...and then stops, including for a manual run
      expect((await service.run())[0]).toContain('stood down');
      expect(chitChatChannel.send).toHaveBeenCalledTimes(2);
    });

    it('still allows a dry run once the job has stood down', async () => {
      setMembers([mockMember({ id: 'a' })]);
      service['consecutiveFailures'] = 2;

      expect((await service.run(true))[0]).toContain('[DRY RUN]');
      expect(chitChatChannel.send).not.toHaveBeenCalled();
    });

    it('clears the failure count once a recording succeeds', async () => {
      setMembers([mockMember({ id: 'a' })]);
      service['consecutiveFailures'] = 1;

      await service.run();

      expect(service['consecutiveFailures']).toBe(0);
    });

    it('refuses to overlap another run', async () => {
      service['isRunning'] = true;

      expect((await service.run())[0]).toContain('already in progress');
      expect(chitChatChannel.send).not.toHaveBeenCalled();
    });

    it('releases the overlap guard when a run throws', async () => {
      (discordService.getAllRolesFromGuild as jest.Mock).mockRejectedValue(new Error('Missing Access'));

      await expect(service.run()).rejects.toThrow('Missing Access');
      expect(service['isRunning']).toBe(false);
    });

    it('throws a legible error when the job is not configured', async () => {
      service['enabled'] = false;

      await expect(service.run()).rejects.toThrow(/not configured/);
    });
  });

  describe('runNudgeJob', () => {
    it('does nothing while the job is disabled', async () => {
      await service.runNudgeJob();

      expect(discordService.getGuild).not.toHaveBeenCalled();
    });

    it('does nothing once the job has stood down', async () => {
      enable();
      service['consecutiveFailures'] = 2;

      await service.runNudgeJob();

      expect(discordService.getGuild).not.toHaveBeenCalled();
    });

    it('reports a failed run to bot jobs rather than throwing out of the cron', async () => {
      enable();
      (discordService.getAllRolesFromGuild as jest.Mock).mockRejectedValue(new Error('Missing Access'));

      await expect(service.runNudgeJob()).resolves.not.toThrow();

      expect(botJobsChannel.send).toHaveBeenCalledWith({
        content: expect.stringContaining('Missing Access'),
        allowedMentions: { users: [] },
      });
    });

    it('runs live, not as a dry run', async () => {
      enable();
      setMembers([mockMember({ id: 'a' })]);

      await service.runNudgeJob();

      expect(chitChatChannel.send).toHaveBeenCalled();
    });
  });
});
