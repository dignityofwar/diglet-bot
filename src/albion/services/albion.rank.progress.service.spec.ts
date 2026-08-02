/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Collection } from 'discord.js';
import { AlbionRankProgressService } from './albion.rank.progress.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { DiscordService } from '../../discord/discord.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const GRADUATE_ROLE = '1218115340009996339';
const ADEPT_ROLE = '1218115422029873153';

describe('AlbionRankProgressService', () => {
  let service: AlbionRankProgressService;
  let registrationsRepository: any;
  let discordService: any;
  let flush: jest.Mock;

  const makeRegistration = (overrides: any = {}) => ({
    id: 1,
    discordId: 'member-1',
    guildId: '6567576868',
    characterName: 'Testy',
    graduateSince: null,
    adeptSince: null,
    ...overrides,
  });

  const memberWithRoles = (id: string, roleIds: string[]) => ({
    id,
    displayName: `member-${id}`,
    user: { id, bot: false },
    roles: { cache: new Collection<string, any>(roleIds.map((r) => [r, { id: r }])) },
  });

  beforeEach(async () => {
    flush = jest.fn().mockResolvedValue(true);

    registrationsRepository = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(null),
      getEntityManager: jest.fn().mockReturnValue({
        persist: jest.fn().mockReturnThis(),
        flush,
      }),
    };

    discordService = {
      getGuild: jest.fn().mockResolvedValue({
        id: 'guild-1',
        members: { fetch: jest.fn().mockResolvedValue(true), cache: new Collection<string, any>() },
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRankProgressService,
        ConfigService,
        { provide: DiscordService, useValue: discordService },
        { provide: getRepositoryToken(AlbionRegistrationsEntity), useValue: registrationsRepository },
      ],
    }).compile();

    TestBootstrapper.setupConfig(module);
    service = module.get<AlbionRankProgressService>(AlbionRankProgressService);
  });

  const withGuildMembers = (members: any[]) => {
    discordService.getGuild.mockResolvedValue({
      id: 'guild-1',
      members: {
        fetch: jest.fn().mockResolvedValue(true),
        cache: new Collection<string, any>(members.map((m) => [m.id, m])),
      },
    });
  };

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('role gain', () => {
    const gainRole = async (roleId: string, registration: any) => {
      registrationsRepository.findOne.mockResolvedValue(registration);
      const before = memberWithRoles('member-1', []);
      const after = memberWithRoles('member-1', [roleId]);
      await service.onGuildMemberUpdate([before, after] as never);
    };

    it('stamps graduateSince when the Graduate role is gained', async () => {
      const registration = makeRegistration();

      await gainRole(GRADUATE_ROLE, registration);

      expect(registration.graduateSince).toBeInstanceOf(Date);
      expect(flush).toHaveBeenCalled();
    });

    it('stamps adeptSince when the Adept role is gained', async () => {
      const registration = makeRegistration();

      await gainRole(ADEPT_ROLE, registration);

      expect(registration.adeptSince).toBeInstanceOf(Date);
    });

    // Removing and re-adding a role must not reset someone's clock
    it('never overwrites a date that is already set', async () => {
      const original = new Date('2020-01-01T00:00:00Z');
      const registration = makeRegistration({ graduateSince: original });

      await gainRole(GRADUATE_ROLE, registration);

      expect(registration.graduateSince).toBe(original);
    });

    it('does nothing when no rank role changed', async () => {
      registrationsRepository.findOne.mockResolvedValue(makeRegistration());
      const same = memberWithRoles('member-1', [GRADUATE_ROLE]);

      await service.onGuildMemberUpdate([same, same] as never);

      expect(registrationsRepository.findOne).not.toHaveBeenCalled();
    });

    it('does not throw when the member has no registration', async () => {
      registrationsRepository.findOne.mockResolvedValue(null);
      const before = memberWithRoles('member-1', []);
      const after = memberWithRoles('member-1', [GRADUATE_ROLE]);

      await expect(service.onGuildMemberUpdate([before, after] as never)).resolves.toBeUndefined();
      expect(flush).not.toHaveBeenCalled();
    });

    it('ignores bots', async () => {
      const before = memberWithRoles('bot', []);
      const after = { ...memberWithRoles('bot', [GRADUATE_ROLE]), user: { id: 'bot', bot: true } };

      await service.onGuildMemberUpdate([before, after] as never);

      expect(registrationsRepository.findOne).not.toHaveBeenCalled();
    });
  });

  describe('boot seeding', () => {
    it('seeds a current Graduate with today', async () => {
      const registration = makeRegistration();
      registrationsRepository.find.mockResolvedValue([registration]);
      withGuildMembers([memberWithRoles('member-1', [GRADUATE_ROLE])]);

      await service.seedExistingRanks();

      expect(registration.graduateSince).toBeInstanceOf(Date);
      expect(registration.adeptSince).toBeNull();
    });

    // Disciple to Adept isn't a legal path, so an Adept was necessarily a Graduate first
    it('seeds an Adept with both dates', async () => {
      const registration = makeRegistration();
      registrationsRepository.find.mockResolvedValue([registration]);
      withGuildMembers([memberWithRoles('member-1', [ADEPT_ROLE])]);

      await service.seedExistingRanks();

      expect(registration.adeptSince).toBeInstanceOf(Date);
      expect(registration.graduateSince).toBeInstanceOf(Date);
    });

    it('only fills nulls, so repeat boots are idempotent', async () => {
      const original = new Date('2020-01-01T00:00:00Z');
      const registration = makeRegistration({ graduateSince: original });
      registrationsRepository.find.mockResolvedValue([registration]);
      withGuildMembers([memberWithRoles('member-1', [GRADUATE_ROLE])]);

      await service.seedExistingRanks();

      expect(registration.graduateSince).toBe(original);
      expect(flush).not.toHaveBeenCalled();
    });

    it('leaves a Disciple alone', async () => {
      const registration = makeRegistration();
      registrationsRepository.find.mockResolvedValue([registration]);
      withGuildMembers([memberWithRoles('member-1', ['1218115269419995166'])]);

      await service.seedExistingRanks();

      expect(registration.graduateSince).toBeNull();
    });

    it('skips registrations whose member has left the server', async () => {
      const registration = makeRegistration();
      registrationsRepository.find.mockResolvedValue([registration]);
      withGuildMembers([]);

      await service.seedExistingRanks();

      expect(registration.graduateSince).toBeNull();
    });

    it('does not stop the bot booting when seeding fails', async () => {
      registrationsRepository.find.mockRejectedValue(new Error('db down'));

      await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
    });
  });
});
