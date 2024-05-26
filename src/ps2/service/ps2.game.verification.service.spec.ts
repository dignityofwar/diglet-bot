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
const mockCharacterId = '5428010618035323201';
const mockOutfitId = TestBootstrapper.mockConfig.ps2.outfitId;

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
    mockPS2Character = TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId) as any;
  });

  describe('onApplicationBootstrap', () => {
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
  });

  describe('isValidRegistrationAttempt', () => {
    it('should return an error if the character is already registered', async () => {
      ps2MembersRepository.find = jest.fn().mockResolvedValue([{
        characterId: mockCharacterId,
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

    it('should return an error if the discord user is already registered but the owner has left the server', async () => {
      ps2MembersRepository.find = jest.fn()
        .mockResolvedValueOnce([{ discordId: '1337' }]);

      mockDiscordUser.guild.members.fetch = jest.fn().mockResolvedValue(null);

      const response = await service.isValidRegistrationAttempt(mockPS2Character, mockDiscordUser);

      expect(response).toBe(`Character **"${mockPS2Character.name.first}"** has already been registered, but the user who registered it has left the server. If you believe this to be in error, please contact the PS2 Leaders.`);
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
    it('should return true if valid', async () => {
      ps2MembersRepository.find = jest.fn().mockResolvedValue([]);
      ps2VerificationAttemptRepository.find = jest.fn().mockResolvedValue([]);

      expect(await service.isValidRegistrationAttempt(mockPS2Character, mockDiscordUser)).toBe(true);
    });
  });

  describe('handleVerification', () => {
    it('should handle unmonitored characters', async () => {
      const deathEvent = {
        character_id: 'unmonitored_character',
        attacker_character_id: 'attacker_character',
      } as any ;

      jest.spyOn(service['logger'], 'warn');

      await service.handleVerification(deathEvent);

      expect(service['logger'].warn).toHaveBeenCalledWith('Received message somehow not related to monitored characters! unmonitored_character');
    });

    it('should handle missing messages', async () => {
      const deathEvent = {
        character_id: 'unmonitored_character',
        attacker_character_id: 'attacker_character',
      } as any ;

      jest.spyOn(service['logger'], 'error');

      await service.handleVerification(deathEvent);

      expect(service['logger'].error).toHaveBeenCalledWith('Message was not found!');
    });
    //
    // it('should handle suicide death events', async () => {
    //   const character = { character_id: 'monitored_character', name: { first: 'TestName' } };
    //   service['monitoringCharacters'].set('monitored_character', character);
    //   const deathEvent = {
    //     character_id: 'monitored_character',
    //     attacker_character_id: 'monitored_character',
    //   };
    //
    //   jest.spyOn(service, 'handleSuccessfulVerification').mockImplementation(async () => {});
    //   jest.spyOn(service['logger'], 'log');
    //
    //   await service['handleVerification'](deathEvent);
    //
    //   expect(service['logger'].log).toHaveBeenCalledWith('Death event for TestName validated!');
    //   expect(service.handleSuccessfulVerification).toHaveBeenCalledWith(character);
    // });
  });
});
