/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { Collection } from 'discord.js';
import { AlbionRankProgressService } from './albion.rank.progress.service';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { TestBootstrapper } from '../../test.bootstrapper';

const GRADUATE_ROLE = '1218115340009996339';
const ADEPT_ROLE = '1218115422029873153';

describe('AlbionRankProgressService', () => {
  let service: AlbionRankProgressService;
  let registrationsRepository: any;
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionRankProgressService,
        ConfigService,
        { provide: getRepositoryToken(AlbionRegistrationsEntity), useValue: registrationsRepository },
      ],
    }).compile();

    TestBootstrapper.setupConfig(module);
    service = module.get<AlbionRankProgressService>(AlbionRankProgressService);
  });

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

    // The migration stamps every registration including Disciples, so a promoted Disciple
    // must get their real promotion date rather than keeping the migration's placeholder
    it('overwrites the migration placeholder when the role is actually gained', async () => {
      const placeholder = new Date('2020-01-01T00:00:00Z');
      const registration = makeRegistration({ graduateSince: placeholder });

      await gainRole(GRADUATE_ROLE, registration);

      expect(registration.graduateSince).not.toBe(placeholder);
      expect(registration.graduateSince!.getFullYear()).toBeGreaterThan(2020);
    });

    const loseRole = async (roleId: string, registration: any) => {
      registrationsRepository.findOne.mockResolvedValue(registration);
      const before = memberWithRoles('member-1', [roleId]);
      const after = memberWithRoles('member-1', []);
      await service.onGuildMemberUpdate([before, after] as never);
    };

    it('clears graduateSince when the Graduate role is taken away', async () => {
      const registration = makeRegistration({ graduateSince: new Date('2020-01-01T00:00:00Z') });

      await loseRole(GRADUATE_ROLE, registration);

      expect(registration.graduateSince).toBeNull();
      expect(flush).toHaveBeenCalled();
    });

    it('clears adeptSince when the Adept role is taken away', async () => {
      const registration = makeRegistration({ adeptSince: new Date('2020-01-01T00:00:00Z') });

      await loseRole(ADEPT_ROLE, registration);

      expect(registration.adeptSince).toBeNull();
    });

    // Demoting an Adept back to Graduate must not wipe the Graduate clock they still hold
    it('leaves graduateSince alone when only Adept is removed', async () => {
      const graduatedAt = new Date('2020-01-01T00:00:00Z');
      const registration = makeRegistration({ graduateSince: graduatedAt, adeptSince: new Date() });
      registrationsRepository.findOne.mockResolvedValue(registration);

      const before = memberWithRoles('member-1', [GRADUATE_ROLE, ADEPT_ROLE]);
      const after = memberWithRoles('member-1', [GRADUATE_ROLE]);
      await service.onGuildMemberUpdate([before, after] as never);

      expect(registration.adeptSince).toBeNull();
      expect(registration.graduateSince).toBe(graduatedAt);
    });

    // The bug this guards: without clearing on demotion, a re-promoted member keeps their
    // original date and clears the 28 day Adept gate instantly
    it('restarts the clock when someone is demoted and later re-promoted', async () => {
      const registration = makeRegistration({ graduateSince: new Date('2020-01-01T00:00:00Z') });

      await loseRole(GRADUATE_ROLE, registration);
      expect(registration.graduateSince).toBeNull();

      await gainRole(GRADUATE_ROLE, registration);

      expect(registration.graduateSince).toBeInstanceOf(Date);
      expect(registration.graduateSince!.getFullYear()).toBeGreaterThan(2020);
    });

    it('does nothing when a date was already clear', async () => {
      const registration = makeRegistration();

      await loseRole(GRADUATE_ROLE, registration);

      expect(flush).not.toHaveBeenCalled();
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
});
