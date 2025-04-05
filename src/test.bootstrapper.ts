/* eslint-disable @typescript-eslint/no-explicit-any */
import { Injectable } from '@nestjs/common';
import _ from 'lodash';
import { ConfigService } from '@nestjs/config';
import { TestingModule } from '@nestjs/testing';
import { MikroORM } from '@mikro-orm/core';
import { AlbionServer } from './albion/interfaces/albion.api.interfaces';
import { PS2MembersEntity } from './database/entities/ps2.members.entity';
import { PS2RankMapInterface } from './config/ps2.app.config';
import { Collection, Role, Snowflake } from 'discord.js';

const guildLeaderRoleUS = '44546543371337';
const guildLeaderRole = '64354579789809089';
const guildOfficerRoleUS = '465544343342364';
const guildOfficerRole = '66343435879886';

const ps2RankMap: PS2RankMapInterface = {
  '@PS2/Verified': {
    ranks: null,
    discordRoleId: '1139909190664601611',
  },
  '@PS2/Zealot': {
    ranks: ['6'],
    discordRoleId: '1139909319886905496',
  },
  '@PS2/SL': {
    ranks: ['4', '5'],
    discordRoleId: '1142546129112805517',
  },
  '@PS2/PL': {
    ranks: ['3'],
    discordRoleId: '1142546081922682900',
  },
  '@PS2/Officer': {
    ranks: ['2'],
    discordRoleId: '1142546051606257755',
  },
  '@PS2/Leader': {
    ranks: ['1'],
    discordRoleId: '1142546013685559337',
  },
};

// Define a type for your EntityManager mock if you like:
interface EntityManagerMock {
  persistAndFlush: jest.Mock;
  removeAndFlush: jest.Mock;
}

// This file helps set up mocks for various tests, which have been copied and pasted across the suite, causing a lot of duplication.
@Injectable()
export class TestBootstrapper {
  static getMockEntityRepo() {
    return {
      find: jest.fn(),
      findOne: jest.fn(),
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
      getEntityManager: jest.fn().mockResolvedValue({
        findOne: jest.fn(),
        find: jest.fn(),
        persistAndFlush: jest.fn(),
        removeAndFlush: jest.fn(),
      }),
    } as any;

    const mockInit = jest.spyOn(MikroORM, 'init');
    mockInit.mockResolvedValue(Promise.resolve({
      em: mockEntityManager,
    } as any));
  }

  static getMockRepositoryInjected(
    entity: any,
    entityManagerOverrides?: Partial<EntityManagerMock>
  ) {
    const defaultEntityManagerMock: EntityManagerMock = {
      persistAndFlush: jest.fn().mockResolvedValue(true),
      removeAndFlush: jest.fn().mockResolvedValue(true),
    };

    // Merge in any overrides, for instance to have removeAndFlush reject
    const entityManagerMock = { ...defaultEntityManagerMock, ...entityManagerOverrides };
    return {
      find: jest.fn().mockResolvedValueOnce([entity]),
      findOne: jest.fn().mockResolvedValueOnce([entity]),
      findAll: jest.fn().mockResolvedValue([entity]),
      create: jest.fn(),
      upsert: jest.fn(),
      // Always return the same instance so that overrides remain in effect
      getEntityManager: jest.fn().mockReturnValue(entityManagerMock),
    } as any;
  }

  private static readonly mockDiscordGuildMember = {
    displayName: 'mockuser',
    id: '90078072660852736',
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

  static getMockDiscordUser(isBot = false) {
    return {
      ...this.mockDiscordGuildMember,
      guild: this.getMockGuild('1234567890'),
      user: {
        id: '90078072660852736',
        username: 'mockuser',
        bot: isBot,
      },
    } as any;
  }

  static getMockGuild(id: string) {
    return {
      id,
      members: {
        cache: {
          get: jest.fn().mockImplementation(() => TestBootstrapper.getMockDiscordUser()),
          has: jest.fn().mockImplementation(() => true),
        },
        fetch: jest.fn().mockImplementation(() => this.getMockDiscordUser()),
      },
      roles: {
        cache: {
          get: jest.fn().mockImplementation(() => TestBootstrapper.getMockDiscordRole('4969797969594')),
          clear: jest.fn(),
        },
        fetch: jest.fn().mockImplementation(() => TestBootstrapper.getMockDiscordRole('4969797969594')),
      },
    };
  }

  static getMockGuildRoleListCollection() {
    return new Collection<Snowflake, Role>()
      .set('123456789012345678', { id: '123456789012345678', name: 'Onboarded' } as Role)
      .set('234567890123456789', { id: '234567890123456789', name: 'Rec/BestGameEver' } as Role)
      .set('345678901234567890', { id: '345678901234567890', name: 'Rec/PS2/Leader' } as Role);
  }

  static getMockDiscordGuildManager(id: string) {
    const mockGuild = this.getMockGuild(id);
    return {
      cache: {
        get: jest.fn().mockReturnValue(mockGuild),
      },
      fetch: jest.fn().mockResolvedValue(mockGuild),
    };
  }

  static getMockDiscordMessage() {
    return {
      edit: jest.fn(),
      delete: jest.fn(),
      channel: {
        // This isn't getMockDiscordMessage again as it'll call an infinite loop
        send: jest.fn().mockImplementation(() => {
          return {
            edit: jest.fn(),
            delete: jest.fn(),
            removeAttachments: jest.fn(),
          };
        }),
        sendTyping: jest.fn(),
      },
      member: this.getMockDiscordUser(),
      roles: {
        cache: {
          has: jest.fn(),
        },
      },
      guild: this.getMockGuild('1234567890'),
      react: jest.fn(),
    } as any;
  }

  static getMockDiscordRole(roleId = '4969797969594') {
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
        member: mockDiscordUser,
        user: mockDiscordUser.user,
        channel: {
          send: jest.fn().mockReturnValue(TestBootstrapper.getMockDiscordMessage()),
        },
        reply: jest.fn(),
      },
    ];
  }

  static getMockDiscordMessageReaction() {
    return {
      message: this.getMockDiscordMessage(),
      partial: false,
      fetch: jest.fn(),
      user: {
        bot: false,
      },
    };
  }

  static getMockDiscordTextChannel() {
    return {
      id: '1234567890', // A mock channel ID
      name: 'test-text-channel', // A mock channel name
      send: jest.fn(),
    };
  }

  static getMockDiscordVoiceChannel() {
    return {
      id: '1234567890', // A mock channel ID
      name: 'Test Voice Channel', // A mock channel name
    };
  }

  static getMockDiscordVoiceState(member, channel) {
    return {
      member: member, // The GuildMember object, mocked separately
      channel: channel, // The VoiceChannel object, could be null or mocked separately
      channelId: channel ? channel.id : null, // Channel ID, null if not in a channel
      guild: member.guild, // The Guild object, usually part of the mocked GuildMember
      deaf: false, // Indicates if the member is deafened
      mute: false, // Indicates if the member is muted
      selfDeaf: false, // Indicates if the member has deafened themselves
      selfMute: false, // Indicates if the member has muted themselves
      streaming: false, // Indicates if the member is streaming
      serverDeaf: false, // Indicates if the member is deafened by the server
      serverMute: false, // Indicates if the member is muted by the server
      selfVideo: false, // Indicates if the member is transmitting video
    };
  }

  static getMockDiscordClient() {
    return {
      guilds: TestBootstrapper.getMockDiscordGuildManager('123456789'),
      channels: {
        fetch: jest.fn(),
      },
      members: {
        fetch: jest.fn(),
      },
      roles: {
        fetch: jest.fn(),
      },
    };
  }

  static getMockAlbionCharacter(
    guildId,
    server: AlbionServer = AlbionServer.AMERICAS
  ) {
    return {
      Id: 'clhoV9OdRm-5BuYQYZBT_Q',
      Name: `Maelstrome26${server === AlbionServer.AMERICAS ? 'US' : 'EU'}`,
      GuildId: guildId ?? server === AlbionServer.AMERICAS ? this.mockConfig.albion.guildIdUS : this.mockConfig.albion.guildId,
    } as any;
  }

  static getMockPS2Character(characterId = '123456', outfitId = '123456') {
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

  static getMockPS2Outfit(outfitId = '123456') {
    return {
      outfit_id: outfitId,
      name: 'Test Outfit',
      name_lower: 'test outfit',
      alias: 'TO',
      alias_lower: 'to',
    };
  }

  static getMockPS2MemberEntity(
    characterId = '123456',
    characterName = 'MrBojangles',
    discordMemberId = '123456'
  ): PS2MembersEntity {
    return {
      id: 1,
      createdAt: new Date,
      updatedAt: new Date,
      discordId: discordMemberId,
      characterId: characterId,
      characterName: characterName,
      manual: false,
      manualCreatedByDiscordId: null,
      manualCreatedByDiscordName: null,
    };
  }

  static readonly mockConfig = {
    albion: {
      guildIdUS: '44545423435',
      guildId: '6567576868',
      guildLeaderRoleUS: { discordRoleId: guildLeaderRoleUS },
      guildLeaderRole: { discordRoleId: guildLeaderRole },
      guildOfficerRoleUS: { discordRoleId: guildOfficerRoleUS },
      guildOfficerRole: { discordRoleId: guildOfficerRole },
      pingLeaderRolesUS: [guildLeaderRoleUS, guildOfficerRoleUS],
      pingLeaderRoles: [guildLeaderRole, guildOfficerRole],
    },
    discord: {
      devUserId: '474839309484',
      channels: {
        albionRegistration: '396474759683473',
        albionUSRoles: '487573839485',
        albionRoles: '657687978899',
        albionUSAnnouncements: '4845759049437495',
        albionAnnouncements: '6655756786797',
        albionScans: '4858696849494',
        ps2Verify: '558787980890809',
        ps2Private: '9705950678045896095',
        ps2HowToRankUp: '84594873574837596',
        ps2Scans: '8558496070888',
      },
      roles: {
        albionUSMember: '454647566868675',
        albionMember: '623445457656789',
        albionUSRegistered: '4657676767676',
        albionRegistered: '67845345346565',
        albionUSAnnouncements: '4566987855434',
        albionAnnouncements: '6879876745643543',
        pingLeaderRolesUS: [guildLeaderRoleUS, guildOfficerRoleUS],
        pingLeaderRoles: [guildLeaderRole, guildOfficerRole],
        ps2Verified: '059769706045',
      },
    },
    ps2: {
      censusServiceId: 'dignityofwar',
      censusTimeout: 30000,
      outfitId: '866685885885885',
      pingRoles: ['1234567890', '9876543210'],
      rankMap: ps2RankMap,
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
