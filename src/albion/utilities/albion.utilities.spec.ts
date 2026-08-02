/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Collection } from 'discord.js';
import { AlbionUtilities } from './albion.utilities';
import { TestBootstrapper } from '../../test.bootstrapper';

const ARCHMAGE = '1218115619732455474';
const MAGISTER = '1218115569455464498';
const ELDRITCH_MAGE = '1218115480426905641';
const ADEPT = '1218115422029873153';
const GRADUATE = '1218115340009996339';
const DISCIPLE = '1218115269419995166';

describe('AlbionUtilities', () => {
  let service: AlbionUtilities;

  const memberWithRoles = (id: string, roleIds: string[], isBot = false) => ({
    id,
    user: { id, bot: isBot },
    roles: { cache: new Collection<string, any>(roleIds.map((r) => [r, { id: r }])) },
  }) as any;

  const guildOf = (members: any[]) => ({
    id: 'guild-1',
    members: {
      fetch: jest.fn().mockResolvedValue(true),
      cache: new Collection<string, any>(members.map((m) => [m.id, m])),
    },
  }) as any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AlbionUtilities, ConfigService],
    }).compile();

    TestBootstrapper.setupConfig(module);
    service = module.get<AlbionUtilities>(AlbionUtilities);
  });

  describe('getHighestAlbionRole', () => {
    it('returns the lowest priority number the member holds', () => {
      const role = service.getHighestAlbionRole(memberWithRoles('a', [DISCIPLE, MAGISTER]));

      expect(role?.name).toBe('@ALB/Magister');
    });

    it('returns null when the member holds no Albion role', () => {
      expect(service.getHighestAlbionRole(memberWithRoles('a', []))).toBeNull();
    });
  });

  describe('isElector', () => {
    it.each([
      ['Archmage', ARCHMAGE, true],
      ['Magister', MAGISTER, true],
      ['Eldritch Mage', ELDRITCH_MAGE, true],
      ['Adept', ADEPT, false],
      ['Graduate', GRADUATE, false],
      ['Disciple', DISCIPLE, false],
    ])('%s may vote: %s', (_name, roleId, expected) => {
      expect(service.isElector(memberWithRoles('a', [roleId]))).toBe(expected);
    });

    it('is false for a member with no Albion role', () => {
      expect(service.isElector(memberWithRoles('a', []))).toBe(false);
    });
  });

  describe('getElectors', () => {
    it('counts a member holding two elector roles only once', async () => {
      const electors = await service.getElectors(guildOf([
        memberWithRoles('a', [ARCHMAGE, MAGISTER]),
      ]));

      expect(electors).toHaveLength(1);
    });

    it('excludes bots and non-electors', async () => {
      const electors = await service.getElectors(guildOf([
        memberWithRoles('elector', [ELDRITCH_MAGE]),
        memberWithRoles('adept', [ADEPT]),
        memberWithRoles('bot', [ARCHMAGE], true),
      ]));

      expect(electors.map((e) => e.id)).toEqual(['elector']);
    });

    it('fetches the full member list rather than trusting the cache', async () => {
      const guild = guildOf([]);

      await service.getElectors(guild);

      expect(guild.members.fetch).toHaveBeenCalled();
    });

    // 7 electors gives a threshold of 4, matching the message leadership post today
    it('supports the documented majority of 4 from 7', async () => {
      const electors = await service.getElectors(guildOf(
        ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((id) => memberWithRoles(id, [ELDRITCH_MAGE])),
      ));

      expect(electors).toHaveLength(7);
      expect(Math.floor(electors.length / 2) + 1).toBe(4);
    });
  });
});
