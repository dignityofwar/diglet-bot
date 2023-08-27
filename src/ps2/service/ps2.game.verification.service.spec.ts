/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { SnowflakeUtil } from 'discord.js';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import * as _ from 'lodash';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { PS2GameVerificationService } from './ps2.game.verification.service';
import { DiscordService } from '../../discord/discord.service';
import { CensusWebsocketService } from './census.websocket.service';
import { EventBusService } from './event.bus.service';
import { PS2VerificationAttemptEntity } from '../../database/entities/ps2.verification.attempt.entity';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';
import { EntityManager, EntityRepository, MikroORM } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';

const verifyChannelId = '123456789';
const expectedRoleId = '987654321';
const expectedCharacterId = '5428010618035323201';
const expectedOutfitId = '37509488620604883';

describe('PS2GameVerificationService', () => {
  let service: PS2GameVerificationService;
  let config: ConfigService;
  let discordService: DiscordService;
  let ps2VerificationAttemptRepository: EntityRepository<PS2VerificationAttemptEntity>;
  let ps2MembersRepository: EntityRepository<PS2MembersEntity>;

  let mockGuildMember: any;
  let mockCharacter: CensusCharacterWithOutfitInterface;
  let mockEntityManager: jest.Mocked<EntityManager>;

  beforeEach(async () => {
    mockEntityManager = {
      find: jest.fn(),
      persistAndFlush: jest.fn(),
      getRepository: jest.fn().mockReturnValue({
        find: jest.fn(),
      }),
    } as any;

    const mockPS2VerificationAttemptRepository = {
      find: jest.fn(),
      // add other methods you might call
    };

    const mockPS2MembersRepository = {
      find: jest.fn(),
      // add other methods you might call
    };

    const mockInit = jest.spyOn(MikroORM, 'init');

    // Now you can set your mock implementation
    mockInit.mockResolvedValue(Promise.resolve({
      em: mockEntityManager,
    } as any));

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PS2GameVerificationService,
        ReflectMetadataProvider,
        { provide: EntityManager, useValue: mockEntityManager },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DiscordService,
          useValue: {
            getChannel: jest.fn(),
            getUser: jest.fn(),
            getRole: jest.fn(),
          },
        },
        {
          provide: CensusWebsocketService,
          useValue: {
          },
        },
        {
          provide: EventBusService,
          useValue: {
          },
        },
        {
          provide: getRepositoryToken(PS2VerificationAttemptEntity),
          useValue: mockPS2VerificationAttemptRepository,
        },
        {
          provide: getRepositoryToken(PS2MembersEntity),
          useValue: mockPS2MembersRepository,
        },
      ],
    }).compile();

    service = module.get<PS2GameVerificationService>(PS2GameVerificationService);
    config = module.get<ConfigService>(ConfigService);
    discordService = module.get<DiscordService>(DiscordService);
    ps2VerificationAttemptRepository = module.get(getRepositoryToken(PS2VerificationAttemptEntity));
    ps2MembersRepository = module.get(getRepositoryToken(PS2MembersEntity));

    // Spy on the 'get' method of the ConfigService, and make it return a specific values based on the path
    jest.spyOn(config, 'get').mockImplementation((key: string) => {
      const data = {
        app: {
          ps2: {
            outfitId: expectedOutfitId,
          },
        },
        discord: {
          devUserId: '1234567890',
          channels: {
            ps2Verify: verifyChannelId,
            ps2Private: '123456789',
            ps2HowToRankUp: '12345678',
          },
          roles: {
            ps2Verified: expectedRoleId,
          },
        },
      };

      const result = _.get(data, key);

      if (!result) {
        throw new Error(`Unexpected config key: ${key}`);
      }

      return result;
    });

    // A mock instance of a GuildMember
    mockGuildMember = {
      createdAt: new Date(),
      createdTimestamp: Date.now(),
      discriminator: '0000',
      displayName: 'TestUser',
      defaultAvatarURL: 'https://defaultavatar.url',
      id: SnowflakeUtil.generate(),
      tag: 'TestUser#0000',
      username: 'TestUser',
      fetch: jest.fn(),
      fetchFlags: jest.fn(),
      toString: jest.fn().mockReturnValue('<@userId>'), // Mocked
      setNickname: jest.fn().mockResolvedValue(() => true),
      roles: {
        add: jest.fn().mockResolvedValue(() => true),
      },
    };

    mockGuildMember.guild = {
      members: {
        fetch: jest.fn().mockImplementation(() => mockGuildMember),
      },
    },

    mockCharacter = {
      character_id: expectedCharacterId,
      name: {
        first: 'Maelstrome26',
        first_lower: 'maelstrome26',
      },
      outfit_info: {
        outfit_id: expectedOutfitId,
        character_id: expectedCharacterId,
        member_since: '1441379570',
        member_since_date: '2015-09-04 15:12:50.0',
        rank: 'Platoon Leader',
        rank_ordinal: '3',
      },
    } as any;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should fail boot if channel does not exist', async () => {
    discordService.getChannel = jest.fn().mockReturnValue(null);
    await expect(service.onApplicationBootstrap()).rejects.toThrow(`Could not find channel with ID ${verifyChannelId}`);
  });

  it('should fail boot if channel is not a text channel', async () => {
    discordService.getChannel = jest.fn().mockReturnValue({
      isTextBased: jest.fn().mockReturnValue(false),
    });

    await expect(service.onApplicationBootstrap()).rejects.toThrow(`Channel with ID ${verifyChannelId} is not a text channel`);
  });

  it('should return an error if the character is already registered', async () => {
    ps2MembersRepository.find = jest.fn().mockResolvedValue([{
      characterId: expectedCharacterId,
      discordId: '1337',
    }]);

    const response = await service.isValidRegistrationAttempt(mockCharacter, mockGuildMember);

    expect(response).toBe(`Character **"${mockCharacter.name.first}"** has already been registered by user \`@${mockGuildMember.displayName}\`. If you believe this to be in error, please contact the PS2 Leaders.`);
  });

  it('should return an error if there\'s an ongoing registration attempt', async () => {
    ps2MembersRepository.find = jest.fn().mockResolvedValue([]);
    ps2VerificationAttemptRepository.find = jest.fn().mockResolvedValue([{
      guildMember: mockGuildMember,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore yeah I'm not supplying a type compatible object here, fuck that
      guildMessage: {},
      characterId: '5',
    }]);

    const response = await service.isValidRegistrationAttempt(mockCharacter, mockGuildMember);

    expect(response).toBe(`Character **"${mockCharacter.name.first}"** already has a pending registration. Please complete it before attempting again. Pinging <@${config.get('discord.devUserId')}> in case there's a problem.`);
  });
});
