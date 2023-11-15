/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';

import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { CensusCharacterWithOutfitInterface } from '../interfaces/CensusCharacterResponseInterface';
import { PS2GameVerificationService } from './ps2.game.verification.service';
import { DiscordService } from '../../discord/discord.service';
import { CensusWebsocketService } from './census.websocket.service';
import { EventBusService } from './event.bus.service';
import { PS2VerificationAttemptEntity } from '../../database/entities/ps2.verification.attempt.entity';
import { PS2MembersEntity } from '../../database/entities/ps2.members.entity';
import { EntityManager, EntityRepository } from '@mikro-orm/core';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { TestBootstrapper } from '../../test.bootstrapper';

const verifyChannelId = TestBootstrapper.mockConfig.discord.channels.ps2Verify;
const expectedCharacterId = '5428010618035323201';
const expectedOutfitId = TestBootstrapper.mockConfig.ps2.outfitId;

describe('PS2GameVerificationService', () => {
  let service: PS2GameVerificationService;
  let discordService: DiscordService;
  let ps2VerificationAttemptRepository: EntityRepository<PS2VerificationAttemptEntity>;
  let ps2MembersRepository: EntityRepository<PS2MembersEntity>;

  let mockDiscordUser: any;
  let mockPS2Character: CensusCharacterWithOutfitInterface;
  let mockEntityManager: jest.Mocked<EntityManager>;

  beforeEach(async () => {
    TestBootstrapper.mockORM();

    const mockPS2VerificationAttemptRepository = TestBootstrapper.getMockRepositoryInjected({});
    const mockPS2MembersRepository = TestBootstrapper.getMockRepositoryInjected({});

    const moduleRef: TestingModule = await Test.createTestingModule({
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
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<PS2GameVerificationService>(PS2GameVerificationService);
    discordService = moduleRef.get<DiscordService>(DiscordService);
    ps2VerificationAttemptRepository = moduleRef.get(getRepositoryToken(PS2VerificationAttemptEntity));
    ps2MembersRepository = moduleRef.get(getRepositoryToken(PS2MembersEntity));

    // A mock instance of a GuildMember
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockPS2Character = {
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
    }]);

    const response = await service.isValidRegistrationAttempt(mockPS2Character, mockDiscordUser);

    expect(response).toBe(`Character **"${mockPS2Character.name.first}"** has already been registered by user \`@${mockDiscordUser.displayName}\`. If you believe this to be in error, please contact the PS2 Leaders.`);
  });

  it('should return an error if the discord user is already registered', async () => {
    ps2MembersRepository.find = jest.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ discordId: '1337' }]);

    const response = await service.isValidRegistrationAttempt(mockPS2Character, mockDiscordUser);

    expect(response).toBe('You have already registered a character. We don\'t allow multiple characters to be registered to the same Discord user, as there is little point to it. If you believe this to be in error, or you have registered the wrong character, please contact the PS2 Leaders.');
  });

  it('should return an error if there\'s an ongoing registration attempt', async () => {
    ps2MembersRepository.find = jest.fn().mockResolvedValue([]);
    ps2VerificationAttemptRepository.find = jest.fn().mockResolvedValue([{
      guildMember: mockDiscordUser,
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore yeah I'm not supplying a type compatible object here, fuck that
      guildMessage: {},
      characterId: '5',
    }]);

    const response = await service.isValidRegistrationAttempt(mockPS2Character, mockDiscordUser);

    expect(response).toBe(`Character **"${mockPS2Character.name.first}"** already has a pending registration. Please complete it before attempting again. Pinging <@${TestBootstrapper.mockConfig.discord.devUserId}> in case there's a problem.`);
  });
});
