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
          fetch: jest.fn().mockImplementation(() => this.getMockDiscordUser()),
        },
        roles: {
          cache: {
            get: jest.fn(),
          },
        },
      },
    } as any;
  }

  static getMockCharacter(guildId) {
    return {
      Id: 'BehrhjrfhK-_!FDHrd$£64tert3',
      Name: 'Maelstrome26',
      GuildId: guildId ?? this.mockConfig.albion.guildId,
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
      },
      roles: {
        albionInitiateRoleId: '123456789',
        albionRegisteredRoleId: '1234567890',
        albionTownCrierRoleId: '987654321',
      },
    },
  };

  static setupConfig(moduleRef: TestingModule, overrideData?: any) {
    const config = moduleRef.get<ConfigService>(ConfigService);
    return jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = overrideData ?? this.mockConfig;

      const result = _.get(data, key);

      if (!result) {
        throw new Error(`Unexpected config key: ${key}`);
      }

      return result;
    });
  }
}
