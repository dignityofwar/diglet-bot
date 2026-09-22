/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Collection } from 'discord.js';
import {
  AlbionPingRoleService,
  MAX_REACTION_REMOVALS_PER_RUN,
  PROGRESS_EDIT_INTERVAL_MS,
} from './albion.ping.role.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { DiscordService } from '../../discord/discord.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const pingRoleIds = TestBootstrapper.mockPingRoleIds;
const exemptRoleId = TestBootstrapper.mockConfig.albion.pingRoleExemptRoles[0];
const rankRoleId = TestBootstrapper.mockConfig.albion.roleMap[0].discordRoleId;
const albionGuildId = TestBootstrapper.mockConfig.albion.guildId;
const devUserId = TestBootstrapper.mockConfig.discord.devUserId;

// Every role on the server, not just the ping ones: the service has to pick the ping roles
// out of a list that also holds rank roles sharing the same ALB/ prefix.
const allGuildRoles = () => TestBootstrapper.getMockPingRoleCollection()
  .set(rankRoleId, { id: rankRoleId, name: 'ALB/Archmage' } as any)
  .set(exemptRoleId, { id: exemptRoleId, name: 'ALB/Alliance' } as any);

describe('AlbionPingRoleService', () => {
  let service: AlbionPingRoleService;
  let discordService: jest.Mocked<DiscordService>;
  let mockRepository: any;
  let mockChannel: any;
  let mockPingsMessage: any;
  let mockGuildPingsMessage: any;

  const setupModule = async (configOverride?: any) => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionPingRoleService,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: DiscordService,
          useValue: {
            getTextChannel: jest.fn(),
            getAllRolesFromGuild: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AlbionRegistrationsEntity),
          useValue: mockRepository,
        },
      ],
    }).compile();

    TestBootstrapper.setupConfig(moduleRef, configOverride);

    service = moduleRef.get<AlbionPingRoleService>(AlbionPingRoleService);
    discordService = moduleRef.get(DiscordService) as any;

    discordService.getTextChannel.mockResolvedValue(mockChannel);
    discordService.getAllRolesFromGuild.mockResolvedValue(allGuildRoles());
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    mockRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
    };

    // Production has two pings embeds, so the fetch answers by ID rather than handing the same
    // message back for both - otherwise every reaction would be counted twice.
    mockPingsMessage = TestBootstrapper.getMockContentPingsMessage();
    mockGuildPingsMessage = TestBootstrapper.getMockGuildPingsMessage();
    mockChannel = {
      messages: {
        fetch: jest.fn().mockImplementation(async (messageId: string) => {
          const message = [mockPingsMessage, mockGuildPingsMessage].find((candidate) => candidate.id === messageId);

          if (!message) {
            throw new Error('Unknown Message');
          }

          return message;
        }),
      },
    };

    await setupModule();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getPingsMessages', () => {
    it('should fetch every configured message from the configured channel', async () => {
      const result = await service.getPingsMessages();

      expect(discordService.getTextChannel).toHaveBeenCalledWith(TestBootstrapper.mockConfig.discord.channels.albionRoles);
      expect(mockChannel.messages.fetch).toHaveBeenCalledTimes(2);
      expect(result.messages).toEqual([mockPingsMessage, mockGuildPingsMessage]);
      expect(result.failed).toEqual([]);
    });

    it.each([[[]], [undefined]])('should return nothing when no message IDs are configured (%p)', async (pingsMessageIds) => {
      await setupModule({
        albion: { ...TestBootstrapper.mockConfig.albion, pingsMessageIds },
        discord: TestBootstrapper.mockConfig.discord,
      });

      const result = await service.getPingsMessages();

      expect(result.messages).toEqual([]);
      expect(result.failed).toEqual([]);
      expect(discordService.getTextChannel).not.toHaveBeenCalled();
    });

    it('should keep the messages it could read and report the ones it could not', async () => {
      mockChannel.messages.fetch.mockRejectedValueOnce(new Error('Unknown Message'));

      const result = await service.getPingsMessages();

      expect(result.messages).toEqual([mockGuildPingsMessage]);
      expect(result.failed).toEqual([TestBootstrapper.mockConfig.albion.pingsMessageIds[0]]);
    });

    it('should report every message when the channel cannot be fetched', async () => {
      discordService.getTextChannel.mockRejectedValue(new Error('No channel'));

      const result = await service.getPingsMessages();

      expect(result.messages).toEqual([]);
      expect(result.failed).toEqual(TestBootstrapper.mockConfig.albion.pingsMessageIds);
    });
  });

  describe('extractText', () => {
    it('should read content, embed title, description and fields', () => {
      const text = service.extractText({
        content: 'top level',
        embeds: [
          {
            title: 'A title',
            description: 'A description',
            fields: [{ name: 'field name', value: 'field value' }],
          },
        ],
      } as any);

      expect(text).toContain('top level');
      expect(text).toContain('A title');
      expect(text).toContain('A description');
      expect(text).toContain('field name');
      expect(text).toContain('field value');
    });

    it('should cope with a message that has no embeds or content', () => {
      expect(service.extractText({} as any)).toBe('');
    });

    it('should cope with an embed with no description or fields', () => {
      expect(service.extractText({ content: '', embeds: [{ title: 'Only a title' }] } as any))
        .toContain('Only a title');
    });

    it('should cope with an embed with no title', () => {
      expect(service.extractText({ embeds: [{ description: 'Only a description' }] } as any))
        .toContain('Only a description');
    });

    it('should cope with a field with no name or value', () => {
      expect(service.extractText({ embeds: [{ fields: [{}] }] } as any).trim()).toBe('');
    });
  });

  describe('getPingRoles', () => {
    it('should resolve every ping role named in the embed', async () => {
      const result = await service.getPingRoles({} as any, [mockPingsMessage]);

      expect(result.roles.size).toBe(3);
      expect(result.roles.map((role) => role.name).sort()).toEqual([
        'ALB/Arena',
        'ALB/FactionWarfare',
        'ALB/Mist',
      ]);
      expect(result.unresolved).toEqual([]);
    });

    it('should union the roles named across every pings message', async () => {
      const result = await service.getPingRoles({} as any, [mockPingsMessage, mockGuildPingsMessage]);

      expect(result.roles.map((role) => role.name).sort()).toEqual([
        'ALB/Arena',
        'ALB/CTA',
        'ALB/FactionWarfare',
        'ALB/Gatherer',
        'ALB/Mist',
      ]);
      expect(result.unresolved).toEqual([]);
    });

    it('should de-duplicate a role named in two different messages', async () => {
      mockGuildPingsMessage.embeds[0].description += '\n☁️ ALB/Mist - named in both by mistake';

      const result = await service.getPingRoles({} as any, [mockPingsMessage, mockGuildPingsMessage]);

      expect(result.roles.size).toBe(5);
    });

    it('should never treat a rank role as a ping role, even when the embed names one', async () => {
      mockPingsMessage.embeds[0].description += '\n👑 ALB/Archmage - the guild leader';

      const result = await service.getPingRoles({} as any, [mockPingsMessage]);

      expect(result.roles.has(rankRoleId)).toBe(false);
      expect(result.roles.size).toBe(3);
      expect(result.unresolved).toEqual([]);
    });

    it('should report role names in the embed that do not exist on the server', async () => {
      mockPingsMessage.embeds[0].description += '\n🐾 ALB/Tracking - if you want to go hunting';

      const result = await service.getPingRoles({} as any, [mockPingsMessage]);

      expect(result.unresolved).toEqual(['ALB/Tracking']);
      expect(result.roles.size).toBe(3);
    });

    it('should de-duplicate a role named twice in the embed', async () => {
      mockPingsMessage.embeds[0].description += '\n☁️ ALB/Mist - mentioned again by mistake';

      const result = await service.getPingRoles({} as any, [mockPingsMessage]);

      expect(result.roles.size).toBe(3);
    });

    it('should return null when there are no messages to read', async () => {
      expect(await service.getPingRoles({} as any, [])).toBeNull();
      expect(discordService.getAllRolesFromGuild).not.toHaveBeenCalled();
    });

    it('should return null when the embed names no ALB/ roles at all', async () => {
      mockPingsMessage.embeds[0].description = 'Someone has emptied the message';

      expect(await service.getPingRoles({} as any, [mockPingsMessage])).toBeNull();
    });

    it('should return null when none of the named roles resolve', async () => {
      discordService.getAllRolesFromGuild.mockResolvedValue(new Collection() as any);

      expect(await service.getPingRoles({} as any, [mockPingsMessage])).toBeNull();
    });

    it('should return null when the embed only names rank roles', async () => {
      mockPingsMessage.embeds[0].description = '👑 ALB/Archmage - the guild leader';

      expect(await service.getPingRoles({} as any, [mockPingsMessage])).toBeNull();
    });
  });

  describe('fetchReactors', () => {
    it('should map each user to the reactions they placed', async () => {
      const message = TestBootstrapper.getMockContentPingsMessage([
        TestBootstrapper.getMockPingReaction('⚔️', ['1', '2']),
        TestBootstrapper.getMockPingReaction('☁️', ['2']),
      ]);

      const reactors = await service.fetchReactors([message]);

      expect(reactors.size).toBe(2);
      expect(reactors.get('1')).toHaveLength(1);
      expect(reactors.get('2')).toHaveLength(2);
    });

    it('should gather a user\'s reactions from every pings message', async () => {
      const content = TestBootstrapper.getMockContentPingsMessage([
        TestBootstrapper.getMockPingReaction('☁️', ['1']),
      ]);
      const guild = TestBootstrapper.getMockGuildPingsMessage([
        TestBootstrapper.getMockPingReaction('📯', ['1', '2']),
      ]);

      const reactors = await service.fetchReactors([content, guild]);

      expect(reactors.size).toBe(2);
      expect(reactors.get('1')).toHaveLength(2);
      expect(reactors.get('2')).toHaveLength(1);
    });

    it('should page past the first 100 users', async () => {
      const userIds = Array.from({ length: 250 }, (_, index) => `user-${index}`);
      const reaction = TestBootstrapper.getMockPingReaction('⚔️', userIds);
      const message = TestBootstrapper.getMockContentPingsMessage([reaction]);

      const reactors = await service.fetchReactors([message]);

      expect(reactors.size).toBe(250);
      expect(reaction.users.fetch).toHaveBeenCalledTimes(3);
      expect(reaction.users.fetch).toHaveBeenNthCalledWith(2, { limit: 100, after: 'user-99' });
    });

    it('should stop paging on an exact multiple of the page size', async () => {
      const userIds = Array.from({ length: 100 }, (_, index) => `user-${index}`);
      const reaction = TestBootstrapper.getMockPingReaction('⚔️', userIds);

      const reactors = await service.fetchReactors([TestBootstrapper.getMockContentPingsMessage([reaction])]);

      expect(reactors.size).toBe(100);
      // One full page, then one empty page proving there is no more
      expect(reaction.users.fetch).toHaveBeenCalledTimes(2);
    });

    it('should ignore bots', async () => {
      const reaction = TestBootstrapper.getMockPingReaction('⚔️', ['1'], ['bot-1']);

      const reactors = await service.fetchReactors([TestBootstrapper.getMockContentPingsMessage([reaction])]);

      expect(reactors.size).toBe(1);
      expect(reactors.has('bot-1')).toBe(false);
    });

    it('should return nothing for a message with no reactions', async () => {
      const reactors = await service.fetchReactors([TestBootstrapper.getMockContentPingsMessage()]);

      expect(reactors.size).toBe(0);
    });
  });

  describe('isExempt', () => {
    it('should be false for a member who has left the server', () => {
      expect(service.isExempt(null)).toBe(false);
    });

    it('should be true for a member holding an exempt role', () => {
      expect(service.isExempt(TestBootstrapper.getMockGuildMemberWithRoles('1', [exemptRoleId]))).toBe(true);
    });

    it('should be false for a member holding only ping roles', () => {
      expect(service.isExempt(TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.mist]))).toBe(false);
    });

    it('should be false when no exempt roles are configured', async () => {
      await setupModule({
        albion: { ...TestBootstrapper.mockConfig.albion, pingRoleExemptRoles: undefined },
        discord: TestBootstrapper.mockConfig.discord,
      });

      expect(service.isExempt(TestBootstrapper.getMockGuildMemberWithRoles('1', [exemptRoleId]))).toBe(false);
    });
  });

  describe('removePingRoles', () => {
    it('should remove only the ping roles the member actually holds', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.mist]);

      const result = await service.removePingRoles(member, TestBootstrapper.getMockPingRoleCollection(), false);

      expect(result.removed).toEqual(['ALB/Mist']);
      expect(member.roles.remove).toHaveBeenCalledTimes(1);
      expect(member.roles.remove).toHaveBeenCalledWith(pingRoleIds.mist);
    });

    it('should report but not perform removals on a dry run', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.mist, pingRoleIds.arena]);

      const result = await service.removePingRoles(member, TestBootstrapper.getMockPingRoleCollection(), true);

      expect(result.removed).toHaveLength(2);
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('should capture an error without abandoning the remaining roles', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.factionWarfare, pingRoleIds.mist]);
      member.roles.remove.mockRejectedValueOnce(new Error('Discord says no'));

      const result = await service.removePingRoles(member, TestBootstrapper.getMockPingRoleCollection(), false);

      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toContain('Discord says no');
      expect(member.roles.remove).toHaveBeenCalledTimes(2);
    });

    it('should do nothing for a member with no ping roles', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', []);

      const result = await service.removePingRoles(member, TestBootstrapper.getMockPingRoleCollection(), false);

      expect(result.removed).toEqual([]);
      expect(member.roles.remove).not.toHaveBeenCalled();
    });
  });

  describe('removeReactions', () => {
    it('should remove the user from each reaction', async () => {
      const first = TestBootstrapper.getMockPingReaction('⚔️', ['1']);
      const second = TestBootstrapper.getMockPingReaction('☁️', ['1']);

      const result = await service.removeReactions([first, second], '1', false);

      expect(result.removed).toBe(2);
      expect(first.users.remove).toHaveBeenCalledWith('1');
      expect(second.users.remove).toHaveBeenCalledWith('1');
    });

    it('should report but not perform removals on a dry run', async () => {
      const reaction = TestBootstrapper.getMockPingReaction('⚔️', ['1']);

      const result = await service.removeReactions([reaction], '1', true);

      expect(result.removed).toBe(1);
      expect(reaction.users.remove).not.toHaveBeenCalled();
    });

    it('should not count a failed removal as removed', async () => {
      const reaction = TestBootstrapper.getMockPingReaction('⚔️', ['1']);
      reaction.users.remove.mockRejectedValueOnce(new Error('Missing Permissions'));

      const result = await service.removeReactions([reaction], '1', false);

      expect(result.removed).toBe(0);
      expect(result.errors[0]).toContain('Missing Permissions');
    });
  });

  describe('stripForDeregistration', () => {
    let responseChannel: any;

    beforeEach(() => {
      responseChannel = { send: jest.fn() };
      mockPingsMessage.reactions.cache = new Collection<string, any>([
        ['0', TestBootstrapper.getMockPingReaction('⚔️', ['1'])],
      ]);
    });

    it('should strip roles and reactions and report what it did', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.mist]);

      const result = await service.stripForDeregistration('1', member, responseChannel);

      expect(result.rolesRemoved).toEqual(['ALB/Mist']);
      expect(result.reactionsRemoved).toBe(1);
      expect(member.roles.remove).toHaveBeenCalledWith(pingRoleIds.mist);
      expect(responseChannel.send).toHaveBeenCalledWith(
        expect.stringContaining('Removed 1 ping role(s) and 1 ping reaction(s) from <@1>'),
      );
    });

    it('should still clear reactions for someone who has left the server', async () => {
      const result = await service.stripForDeregistration('1', null, responseChannel);

      expect(result.rolesRemoved).toEqual([]);
      expect(result.reactionsRemoved).toBe(1);
      expect(discordService.getAllRolesFromGuild).not.toHaveBeenCalled();
    });

    it('should leave an exempt member entirely alone', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [exemptRoleId, pingRoleIds.mist]);

      const result = await service.stripForDeregistration('1', member, responseChannel);

      expect(result).toBeNull();
      expect(member.roles.remove).not.toHaveBeenCalled();
      expect(mockChannel.messages.fetch).not.toHaveBeenCalled();
    });

    it('should do nothing when no pings message can be read', async () => {
      mockChannel.messages.fetch.mockRejectedValue(new Error('Unknown Message'));
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.mist]);

      expect(await service.stripForDeregistration('1', member, responseChannel)).toBeNull();
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('should clear reactions from every pings message', async () => {
      const guildPingsReaction = TestBootstrapper.getMockPingReaction('📯', ['1']);
      mockGuildPingsMessage.reactions.cache = new Collection<string, any>([['0', guildPingsReaction]]);
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.cta]);

      const result = await service.stripForDeregistration('1', member, responseChannel);

      expect(result.reactionsRemoved).toBe(2);
      expect(guildPingsReaction.users.remove).toHaveBeenCalledWith('1');
      // A role that only the guild pings embed names still has to come off
      expect(member.roles.remove).toHaveBeenCalledWith(pingRoleIds.cta);
    });

    it('should still clear reactions when the ping roles cannot be resolved', async () => {
      discordService.getAllRolesFromGuild.mockResolvedValue(new Collection() as any);
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.mist]);

      const result = await service.stripForDeregistration('1', member, responseChannel);

      expect(result.rolesRemoved).toEqual([]);
      expect(result.reactionsRemoved).toBe(1);
      expect(member.roles.remove).not.toHaveBeenCalled();
    });

    it('should stay quiet when there was nothing to remove', async () => {
      mockPingsMessage.reactions.cache = new Collection();
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', []);

      const result = await service.stripForDeregistration('1', member, responseChannel);

      expect(result.rolesRemoved).toEqual([]);
      expect(result.reactionsRemoved).toBe(0);
      expect(responseChannel.send).not.toHaveBeenCalled();
    });

    it('should report an error and ping the dev', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('1', [pingRoleIds.mist]);
      member.roles.remove.mockRejectedValueOnce(new Error('Discord says no'));

      await service.stripForDeregistration('1', member, responseChannel);

      expect(responseChannel.send).toHaveBeenCalledWith(
        expect.stringContaining(`Discord says no Pinging <@${devUserId}>!`),
      );
    });

    it('should attempt every reaction rather than paging the reactor lists', async () => {
      const first = TestBootstrapper.getMockPingReaction('⚔️', []);
      const second = TestBootstrapper.getMockPingReaction('☁️', []);
      mockPingsMessage.reactions.cache = new Collection<string, any>([['0', first], ['1', second]]);

      await service.stripForDeregistration('1', null, responseChannel);

      expect(first.users.fetch).not.toHaveBeenCalled();
      expect(first.users.remove).toHaveBeenCalledWith('1');
      expect(second.users.remove).toHaveBeenCalledWith('1');
    });
  });

  describe('reconcile', () => {
    let scanMessage: any;
    let members: Collection<string, any>;

    // Per-member lines are sent as a placeholder and then edited in, so the report is only
    // legible to a test that watches both calls.
    let edits: string[];

    const buildScanMessage = () => {
      const guild = {
        id: TestBootstrapper.mockConfig.discord.guildId,
        members: { fetch: jest.fn().mockImplementation(async () => members) },
      };
      return {
        id: 'scan-message',
        guild,
        edit: jest.fn(),
        delete: jest.fn(),
        channel: {
          guild,
          send: jest.fn().mockImplementation(async () => ({
            edit: jest.fn().mockImplementation(async (content: string) => edits.push(content)),
          })),
        },
      } as any;
    };

    const sentMessages = () => [
      ...(scanMessage.channel.send as jest.Mock).mock.calls.map((call) => call[0]),
      ...edits,
    ];

    beforeEach(() => {
      members = new Collection();
      edits = [];
      scanMessage = buildScanMessage();
    });

    it('should skip and say so when no pings message can be read', async () => {
      mockChannel.messages.fetch.mockRejectedValue(new Error('Unknown Message'));

      expect(await service.reconcile(scanMessage)).toBe(false);
      expect(sentMessages().join()).toContain('no pings messages could be read');
      expect(scanMessage.guild.members.fetch).not.toHaveBeenCalled();
    });

    it('should carry on but shout when only one pings message can be read', async () => {
      mockChannel.messages.fetch.mockRejectedValueOnce(new Error('Unknown Message'));
      const member = TestBootstrapper.getMockGuildMemberWithRoles('leaver', [pingRoleIds.cta]);
      members.set('leaver', member);

      const actionRequired = await service.reconcile(scanMessage);

      expect(actionRequired).toBe(true);
      expect(sentMessages().join()).toContain('1 configured pings message(s) could not be read');
      expect(member.roles.remove).toHaveBeenCalledWith(pingRoleIds.cta);
    });

    it('should strip a role that only the guild pings message names', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('leaver', [pingRoleIds.gatherer]);
      members.set('leaver', member);
      const reaction = TestBootstrapper.getMockPingReaction('👨‍🌾', ['leaver']);
      mockGuildPingsMessage.reactions.cache = new Collection<string, any>([['0', reaction]]);

      const actionRequired = await service.reconcile(scanMessage);

      expect(actionRequired).toBe(true);
      expect(member.roles.remove).toHaveBeenCalledWith(pingRoleIds.gatherer);
      expect(reaction.users.remove).toHaveBeenCalledWith('leaver');
    });

    it('should skip and say so when no ping roles resolve', async () => {
      discordService.getAllRolesFromGuild.mockResolvedValue(new Collection() as any);

      expect(await service.reconcile(scanMessage)).toBe(false);
      expect(sentMessages().join()).toContain('no ping roles could be resolved');
      expect(scanMessage.guild.members.fetch).not.toHaveBeenCalled();
    });

    it('should warn about role names in the embed that do not exist', async () => {
      mockPingsMessage.embeds[0].description += '\n🐾 ALB/Tracking - if you want to go hunting';

      await service.reconcile(scanMessage);

      expect(sentMessages().join()).toContain('**ALB/Tracking**');
    });

    it('should strip an unregistered member of their ping roles and reactions', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('leaver', [pingRoleIds.mist]);
      members.set('leaver', member);
      const reaction = TestBootstrapper.getMockPingReaction('☁️', ['leaver']);
      mockPingsMessage.reactions.cache = new Collection<string, any>([['0', reaction]]);

      const actionRequired = await service.reconcile(scanMessage);

      expect(actionRequired).toBe(true);
      expect(member.roles.remove).toHaveBeenCalledWith(pingRoleIds.mist);
      expect(reaction.users.remove).toHaveBeenCalledWith('leaver');
      expect(sentMessages().join()).toContain('1 member(s) stripped of ping roles');
    });

    it('should leave a registered member alone', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('keeper', [pingRoleIds.mist]);
      members.set('keeper', member);
      const reaction = TestBootstrapper.getMockPingReaction('☁️', ['keeper']);
      mockPingsMessage.reactions.cache = new Collection<string, any>([['0', reaction]]);
      mockRepository.find.mockResolvedValue([{ discordId: 'keeper' } as AlbionRegistrationsEntity]);

      const actionRequired = await service.reconcile(scanMessage);

      expect(actionRequired).toBe(false);
      expect(member.roles.remove).not.toHaveBeenCalled();
      expect(reaction.users.remove).not.toHaveBeenCalled();
      expect(mockRepository.find).toHaveBeenCalledWith({ guildId: albionGuildId });
    });

    it('should leave an unregistered alliance member alone', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('ally', [exemptRoleId, pingRoleIds.mist]);
      members.set('ally', member);
      const reaction = TestBootstrapper.getMockPingReaction('☁️', ['ally']);
      mockPingsMessage.reactions.cache = new Collection<string, any>([['0', reaction]]);

      const actionRequired = await service.reconcile(scanMessage);

      expect(actionRequired).toBe(false);
      expect(member.roles.remove).not.toHaveBeenCalled();
      expect(reaction.users.remove).not.toHaveBeenCalled();
    });

    it('should ignore bots holding a ping role', async () => {
      const bot = TestBootstrapper.getMockGuildMemberWithRoles('bot', [pingRoleIds.mist], true);
      members.set('bot', bot);

      const actionRequired = await service.reconcile(scanMessage);

      expect(actionRequired).toBe(false);
      expect(bot.roles.remove).not.toHaveBeenCalled();
    });

    it('should clear the reactions of someone who has left the Discord server', async () => {
      const reaction = TestBootstrapper.getMockPingReaction('☁️', ['ghost']);
      mockPingsMessage.reactions.cache = new Collection<string, any>([['0', reaction]]);

      const actionRequired = await service.reconcile(scanMessage);

      expect(actionRequired).toBe(true);
      expect(reaction.users.remove).toHaveBeenCalledWith('ghost');
      expect(sentMessages().join()).toContain('has left the Discord server');
    });

    it('should never strip a rank role', async () => {
      mockPingsMessage.embeds[0].description += '\n👑 ALB/Archmage - the guild leader';
      const member = TestBootstrapper.getMockGuildMemberWithRoles('leaver', [rankRoleId, pingRoleIds.mist]);
      members.set('leaver', member);

      await service.reconcile(scanMessage);

      expect(member.roles.remove).toHaveBeenCalledWith(pingRoleIds.mist);
      expect(member.roles.remove).not.toHaveBeenCalledWith(rankRoleId);
    });

    it('should change nothing on a dry run but still report', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('leaver', [pingRoleIds.mist]);
      members.set('leaver', member);
      const reaction = TestBootstrapper.getMockPingReaction('☁️', ['leaver']);
      mockPingsMessage.reactions.cache = new Collection<string, any>([['0', reaction]]);

      const actionRequired = await service.reconcile(scanMessage, true);

      expect(actionRequired).toBe(true);
      expect(member.roles.remove).not.toHaveBeenCalled();
      expect(reaction.users.remove).not.toHaveBeenCalled();
      expect(sentMessages().join()).toContain('(DRY RUN)');
    });

    it('should say so when nothing needs doing', async () => {
      expect(await service.reconcile(scanMessage)).toBe(false);
      expect(sentMessages().join()).toContain('No ping role inconsistencies were detected');
    });

    it('should report a live membership count for every ping role', async () => {
      members.set('a', TestBootstrapper.getMockGuildMemberWithRoles('a', [pingRoleIds.mist]));
      members.set('b', TestBootstrapper.getMockGuildMemberWithRoles('b', [pingRoleIds.mist]));
      mockRepository.find.mockResolvedValue([
        { discordId: 'a' } as AlbionRegistrationsEntity,
        { discordId: 'b' } as AlbionRegistrationsEntity,
      ]);

      await service.reconcile(scanMessage);

      const report = sentMessages().join();
      expect(report).toContain('**ALB/Mist**: 2');
      expect(report).toContain('**ALB/Arena**: 0');
    });

    it('should count only what survives the sweep', async () => {
      members.set('a', TestBootstrapper.getMockGuildMemberWithRoles('a', [pingRoleIds.mist]));
      const leaver = TestBootstrapper.getMockGuildMemberWithRoles('b', [pingRoleIds.mist]);
      // The sweep removes the role, so the live count must not include them any more
      leaver.roles.remove.mockImplementation(async () => leaver.roles.cache.has.mockReturnValue(false));
      members.set('b', leaver);
      mockRepository.find.mockResolvedValue([{ discordId: 'a' } as AlbionRegistrationsEntity]);

      await service.reconcile(scanMessage);

      expect(sentMessages().join()).toContain('**ALB/Mist**: 1');
    });

    it('should defer reactions beyond the per-run cap to the next run', async () => {
      const ghostIds = Array.from({ length: MAX_REACTION_REMOVALS_PER_RUN + 10 }, (_, index) => `ghost-${index}`);
      const reaction = TestBootstrapper.getMockPingReaction('☁️', ghostIds);
      mockPingsMessage.reactions.cache = new Collection<string, any>([['0', reaction]]);

      await service.reconcile(scanMessage);

      expect(reaction.users.remove).toHaveBeenCalledTimes(MAX_REACTION_REMOVALS_PER_RUN);
      expect(sentMessages().join()).toContain('10 reaction(s) were left for the next run');
    });

    it('should report removal errors and ping the dev', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('leaver', [pingRoleIds.mist]);
      member.roles.remove.mockRejectedValueOnce(new Error('Discord says no'));
      members.set('leaver', member);

      await service.reconcile(scanMessage);

      expect(sentMessages().join()).toContain(`Discord says no Pinging <@${devUserId}>!`);
    });

    describe('progress reporting', () => {
      const addLeavers = (count: number) => {
        for (let index = 0; index < count; index++) {
          members.set(`leaver-${index}`, TestBootstrapper.getMockGuildMemberWithRoles(`leaver-${index}`, [pingRoleIds.mist]));
        }
      };

      afterEach(() => {
        jest.restoreAllMocks();
      });

      it('should not edit the scan message when the sweep is quick', async () => {
        addLeavers(3);

        await service.reconcile(scanMessage);

        expect(scanMessage.edit).not.toHaveBeenCalled();
      });

      it('should report progress against the heading it was given once the interval passes', async () => {
        addLeavers(3);
        // Every check of the clock reads two seconds later, so each member trips the throttle
        let clock = Date.now();
        jest.spyOn(Date, 'now').mockImplementation(() => (clock += PROGRESS_EDIT_INTERVAL_MS));

        await service.reconcile(scanMessage, false, '# Sweeping ping roles...');

        const progressEdits = (scanMessage.edit as jest.Mock).mock.calls.map((call) => call[0]);
        expect(progressEdits[0]).toContain('# Sweeping ping roles... [0/3] (0%)');
        // The last edit is the finishing one, so it always reads as complete
        expect(progressEdits[progressEdits.length - 1]).toContain('[3/3] (100%)');
      });

      it('should carry on when a progress edit fails', async () => {
        addLeavers(3);
        let clock = Date.now();
        jest.spyOn(Date, 'now').mockImplementation(() => (clock += PROGRESS_EDIT_INTERVAL_MS));
        scanMessage.edit.mockRejectedValue(new Error('Unknown Message'));

        expect(await service.reconcile(scanMessage)).toBe(true);
      });
    });

    it('should sweep a member who reacted but holds no ping role', async () => {
      const member = TestBootstrapper.getMockGuildMemberWithRoles('leaver', []);
      members.set('leaver', member);
      const reaction = TestBootstrapper.getMockPingReaction('☁️', ['leaver']);
      mockPingsMessage.reactions.cache = new Collection<string, any>([['0', reaction]]);

      const actionRequired = await service.reconcile(scanMessage);

      expect(actionRequired).toBe(true);
      expect(reaction.users.remove).toHaveBeenCalledWith('leaver');
      expect(sentMessages().join()).toContain('is not registered');
    });
  });
});
