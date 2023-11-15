/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import { SnowflakeUtil } from 'discord.js';
import _ from 'lodash';
import { ConfigService } from '@nestjs/config';
import { TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';

// This file helps set up mocks for various tests, which have been copied and pasted across the suite, causing a lot of duplication.
@Injectable()
export class TestBootstrapper {
  static mockEntityRepo = {
    find: jest.fn(),
    create: jest.fn(),
    upsert: jest.fn(),
  };

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

  private static mockEntityManager = {
    find: jest.fn(),
    persistAndFlush: jest.fn(),
    getRepository: jest.fn().mockReturnValue({
      find: jest.fn(),
      persistAndFlush: jest.fn(),
    }),
  };

  private static mockDiscordUser = {
    displayName: 'mockuser',
    id: SnowflakeUtil.generate(),
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
    };
  }

  static mockDiscordMessage = {
    edit: jest.fn(),
    delete: jest.fn(),
    channel: {
      send: jest.fn().mockImplementation(() => {
        return {
          removeAttachments: jest.fn(),
        };
      }),
    },
  };

  static getMockCharacter(guildId) {
    return {
      Id: '123456789',
      Name: 'TestCharacter',
      GuildId: guildId,
    };
  }

  static mockConfig = {
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
      },
      roles: {
        albionInitiateRoleId: '123456789',
        albionRegisteredRoleId: '1234567890',
        albionTownCrierRoleId: '987654321',
      },
    },
  };

  static setupConfig(moduleRef: TestingModule) {
    const config = moduleRef.get<ConfigService>(ConfigService);
    return jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = this.mockConfig;

      const result = _.get(data, key);

      if (!result) {
        throw new Error(`Unexpected config key: ${key}`);
      }

      return result;
    });
  }
}
