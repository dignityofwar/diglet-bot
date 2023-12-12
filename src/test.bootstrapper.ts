/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import { ConfigService } from '@nestjs/config';
import { TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';

// This file helps set up mocks for various tests, which have been copied and pasted across the suite, causing a lot of duplication.
@Injectable()
export class TestBootstrapper {
  static getMockEntityRepo() {
    return {
      find: jest.fn(),
      create: jest.fn(),
      upsert: jest.fn(),
    } as any;
  }

  static mockORM() {
    const mockEntityManager = {
      find: jest.fn(),
      persistAndFlush: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn(),
      }),
    } as any;

    const mockInit = jest.spyOn(MikroORM, 'init');
    mockInit.mockResolvedValue(Promise.resolve({
      em: mockEntityManager,
    } as any));
  }

  static getMockRepositoryInjected(entity) {
    return {
      find: jest.fn().mockResolvedValueOnce([entity]),
      findOne: jest.fn().mockResolvedValueOnce([entity]),
      findAll: jest.fn().mockResolvedValue([entity]),
      create: jest.fn(),
      upsert: jest.fn(),
      persistAndFlush: jest.fn().mockResolvedValue([entity]),
      removeAndFlush: jest.fn(),
    } as any;
  }

  private static readonly mockDiscordUser = {
    displayName: 'mockuser',
    id: '90078072660852736',
    username: 'TestUser',
    fetch: jest.fn(),
    roles: {
      add: jest.fn(),
      remove: jest.fn(),
      cache: {
        has: jest.fn(),
        get: jest.fn(),
      },
    },
    setNickname: jest.fn().mockResolvedValue(() => true),
    kick: jest.fn().mockResolvedValue(() => true),
  };
  static getMockDiscordUser() {
    return {
      ...this.mockDiscordUser,
      guild: {
        members: {
          fetch: jest.fn().mockImplementation(() => this.mockDiscordUser),
        },
        roles: {
          cache: {
            get: jest.fn(),
          },
        },
      },
    } as any;
  }

  static getMockDiscordMessage() {
    return {
      edit: jest.fn(),
      delete: jest.fn(),
      channel: {
        send: jest.fn().mockImplementation(() => {
          return {
            edit: jest.fn(),
            delete: jest.fn(),
            removeAttachments: jest.fn(),
          };
        }),
      },
      roles: {
        cache: {
          has: jest.fn(),
        },
      },
      guild: {
        members: {
          cache: jest.fn(),
          fetch: jest.fn().mockImplementation(() => this.getMockDiscordUser()),
        },
        roles: {
          fetch: jest.fn().mockImplementation(() => this.getMockDiscordRole('4969797969594')),
          cache: {
            get: jest.fn().mockImplementation(() => this.getMockDiscordRole('4969797969594')),
          },
        },
      },
    } as any;
  }

  static getMockDiscordRole(roleId: string) {
    return {
      id: roleId,
      name: 'mockrole',
      members: {
        has: jest.fn().mockImplementation(() => true),
        cache: {
          has: jest.fn().mockImplementation(() => true),
        },
      },
    } as any;
  }

  static getMockDiscordInteraction(channelId: string, mockDiscordUser) {
    return [
      {
        channelId: channelId,
        guild: {
          roles: {
            fetch: jest.fn().mockImplementation(() => this.getMockDiscordRole('4969797969594')),
          },
          members: {
            fetch: jest.fn().mockImplementation(() => this.getMockDiscordUser()),
          },
        },
        user: mockDiscordUser,
        channel: {
          send: jest.fn().mockImplementation(() => {
            return {
              edit: jest.fn(),
            };
          }),
        },
      },
    ];
  }

  static getMockAlbionCharacter(guildId) {
    return {
      Id: 'BehrhjrfhK-_!FDHrd$£64tert3',
      Name: 'Maelstrome26',
      GuildId: guildId ?? this.mockConfig.albion.guildId,
    } as any;
  }

  static getMockPS2Character(characterId, outfitId) {
    return {
      character_id: characterId,
      name: {
        first: 'Maelstrome26',
        first_lower: 'maelstrome26',
      },
      outfit_info: {
        outfit_id: outfitId,
        character_id: characterId,
        member_since: '1441379570',
        member_since_date: '2015-09-04 15:12:50.0',
        rank: 'Platoon Leader',
        rank_ordinal: '3',
      },
    } as any;
  }

  static readonly mockConfig = {
    albion: {
      guildId: '54545423435',
      guildMasterRole: { discordRoleId: '14546543371337' },
      masterRole: { discordRoleId: '565544342364' },
    },
    discord: {
      devUserId: '474839309484',
      channels: {
        albionRegistration: '396474759683473',
        albionInfopoint: '387573839485',
        albionTownCrier: '3845759049437495',
        albionScans: '4858696849494',
        ps2Verify: '558787980890809',
        ps2Scans: '8558496070888',
        ps2Private: '9705950678045896095',
        ps2HowToRankUp: '84594873574837596',
      },
      roles: {
        albionInitiateRoleId: '123456789',
        albionRegisteredRoleId: '1234567890',
        albionTownCrierRoleId: '987654321',
        ps2Verified: '059769706045',
      },
    },
    ps2: {
      censusServiceId: 'dignityofwar',
      censusTimeout: 30000,
      outfitId: '866685885885885',
    },
  };

  static setupConfig(moduleRef: TestingModule, overrideData?: any) {
    const config = moduleRef.get<ConfigService>(ConfigService);
    return jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = overrideData ?? this.mockConfig;

      const result = _.get(data, key);

      if (!result && !overrideData) {
        throw new Error(`Unexpected config key: ${key}`);
      }

      return result;
    });
  }
}
