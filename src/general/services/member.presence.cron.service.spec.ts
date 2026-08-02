/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ActivityType, Collection } from 'discord.js';
import { MemberPresenceCronService } from './member.presence.cron.service';
import { MemberActivityRollupService } from './member.activity.rollup.service';
import { DiscordService } from '../../discord/discord.service';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('MemberPresenceCronService', () => {
  let service: MemberPresenceCronService;
  let discordService: any;
  let rollupService: any;

  const guildWithMembers = (members: any[]) => ({
    id: 'guild-1',
    members: { cache: new Collection<string, any>(members.map((m) => [m.id, m])) },
  });

  beforeEach(async () => {
    discordService = {
      getVoiceChannelMembers: jest.fn().mockResolvedValue([]),
      getGuild: jest.fn().mockResolvedValue(guildWithMembers([])),
    };
    rollupService = {
      increment: jest.fn().mockResolvedValue(undefined),
      incrementGameMinutes: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MemberPresenceCronService,
        ConfigService,
        { provide: DiscordService, useValue: discordService },
        { provide: MemberActivityRollupService, useValue: rollupService },
      ],
    }).compile();

    TestBootstrapper.setupConfig(module);
    service = module.get<MemberPresenceCronService>(MemberPresenceCronService);
    await service.onApplicationBootstrap();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('voice minutes', () => {
    it('increments a minute for everyone connected', async () => {
      discordService.getVoiceChannelMembers.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);

      await service.recordVoiceMinutes();

      expect(rollupService.increment).toHaveBeenCalledWith(['a', 'b'], 'voiceMinutes');
    });

    it('does nothing when nobody is in voice', async () => {
      await service.recordVoiceMinutes();

      expect(rollupService.increment).not.toHaveBeenCalled();
    });

    it('warns rather than throwing when the guild cannot be read', async () => {
      discordService.getVoiceChannelMembers.mockRejectedValue(new Error('cache cold'));

      await expect(service.recordVoiceMinutes()).resolves.toBeUndefined();
    });
  });

  describe('game minutes', () => {
    it('records members playing a game', async () => {
      discordService.getGuild.mockResolvedValue(guildWithMembers([
        TestBootstrapper.getMockDiscordMemberWithPresence('a', [
          { name: 'Albion Online', type: ActivityType.Playing },
        ]),
      ]));

      await service.recordGameMinutes();

      expect(rollupService.incrementGameMinutes).toHaveBeenCalledWith([
        { discordId: 'a', gameName: 'Albion Online' },
      ]);
    });

    // This filter is the correctness of the whole feature
    it('ignores custom statuses, Spotify, streaming and competing', async () => {
      discordService.getGuild.mockResolvedValue(guildWithMembers([
        TestBootstrapper.getMockDiscordMemberWithPresence('a', [
          { name: 'feeling cute', type: ActivityType.Custom },
          { name: 'Spotify', type: ActivityType.Listening },
          { name: 'Twitch', type: ActivityType.Streaming },
          { name: 'Chess', type: ActivityType.Competing },
          { name: 'Watching paint', type: ActivityType.Watching },
        ]),
      ]));

      await service.recordGameMinutes();

      expect(rollupService.incrementGameMinutes).not.toHaveBeenCalled();
    });

    it('skips bots', async () => {
      discordService.getGuild.mockResolvedValue(guildWithMembers([
        TestBootstrapper.getMockDiscordMemberWithPresence('bot', [
          { name: 'Albion Online', type: ActivityType.Playing },
        ], true),
      ]));

      await service.recordGameMinutes();

      expect(rollupService.incrementGameMinutes).not.toHaveBeenCalled();
    });

    it('skips members with no presence', async () => {
      discordService.getGuild.mockResolvedValue(guildWithMembers([
        { id: 'a', user: { id: 'a', bot: false }, presence: null },
      ]));

      await service.recordGameMinutes();

      expect(rollupService.incrementGameMinutes).not.toHaveBeenCalled();
    });

    it('records both games when a member has two running', async () => {
      discordService.getGuild.mockResolvedValue(guildWithMembers([
        TestBootstrapper.getMockDiscordMemberWithPresence('a', [
          { name: 'Albion Online', type: ActivityType.Playing },
          { name: 'Foxhole', type: ActivityType.Playing },
        ]),
      ]));

      await service.recordGameMinutes();

      expect(rollupService.incrementGameMinutes).toHaveBeenCalledWith([
        { discordId: 'a', gameName: 'Albion Online' },
        { discordId: 'a', gameName: 'Foxhole' },
      ]);
    });
  });

  describe('re-entrancy', () => {
    it('skips a tick while the previous one is still running', async () => {
      let release: () => void;
      discordService.getVoiceChannelMembers.mockImplementation(
        () => new Promise((resolve) => { release = () => resolve([{ id: 'a' }]); }),
      );

      const first = service.recordPresenceMinutes();
      await service.recordPresenceMinutes(); // Should bail out immediately

      release();
      await first;

      // Only the first tick's voice sweep ran
      expect(discordService.getVoiceChannelMembers).toHaveBeenCalledTimes(1);
    });

    it('clears the guard so the next tick can run', async () => {
      await service.recordPresenceMinutes();
      await service.recordPresenceMinutes();

      expect(discordService.getVoiceChannelMembers).toHaveBeenCalledTimes(2);
    });

    it('still records game minutes when the voice half fails', async () => {
      discordService.getVoiceChannelMembers.mockRejectedValue(new Error('boom'));
      discordService.getGuild.mockResolvedValue(guildWithMembers([
        TestBootstrapper.getMockDiscordMemberWithPresence('a', [
          { name: 'Albion Online', type: ActivityType.Playing },
        ]),
      ]));

      await service.recordPresenceMinutes();

      expect(rollupService.incrementGameMinutes).toHaveBeenCalled();
    });
  });
});
