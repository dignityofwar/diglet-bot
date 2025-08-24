/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { TestBootstrapper } from '../../test.bootstrapper';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getRepositoryToken } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ReflectMetadataProvider } from '@discord-nestjs/core';
import { AlbionDeregistrationService } from './albion.deregistration.service';
import { DiscordService } from '../../discord/discord.service';
import { Role } from 'discord.js';

let mockAlbionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>;

let mockRegistration: AlbionRegistrationsEntity;
let mockCharacter: AlbionPlayerInterface;
let mockChannel: any;
let mockDiscordMember: any;

describe('AlbionDeregistrationService', () => {
  let service: AlbionDeregistrationService;
  let discordService: DiscordService;

  beforeEach(async () => {
    mockCharacter = TestBootstrapper.getMockAlbionCharacter(AlbionServer.EUROPE);

    mockRegistration = {
      id: 123456789,
      discordId: '123456789',
      characterId: mockCharacter.Id,
      characterName: mockCharacter.Name,
      guildId: mockCharacter.GuildId,
      manual: false,
      manualCreatedByDiscordId: null,
      manualCreatedByDiscordName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AlbionRegistrationsEntity;

    mockAlbionRegistrationsRepository = TestBootstrapper.getMockRepositoryInjected(mockRegistration);

    mockChannel = TestBootstrapper.getMockDiscordTextChannel();

    mockDiscordMember = TestBootstrapper.getMockDiscordUser();

    const moduleRef = await Test.createTestingModule({
      providers: [
        ReflectMetadataProvider,
        AlbionDeregistrationService,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: DiscordService,
          useValue: {
            getGuildMember: jest.fn(),
            getRoleViaMember: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(AlbionRegistrationsEntity),
          useValue: mockAlbionRegistrationsRepository,
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<AlbionDeregistrationService>(AlbionDeregistrationService);
    discordService = moduleRef.get<DiscordService>(DiscordService);
  });

  describe('deregister', () => {
    // Set up spies on stripRegistration and stripRoles
    let stripRegistrationSpy: any;
    let stripRolesSpy: any;

    beforeEach(() => {
      jest.clearAllMocks();

      stripRegistrationSpy = jest.spyOn(service, 'stripRegistration').mockResolvedValue();
      stripRolesSpy = jest.spyOn(service, 'stripRoles').mockResolvedValue();

      // Set up so that the Discordservice always returns a mock member
      jest.spyOn(discordService, 'getGuildMember').mockResolvedValue(mockDiscordMember);
    });

    it('should call stripRegistration and stripRoles', async () => {
      await service.deregister(mockDiscordMember.id, mockChannel);

      expect(stripRegistrationSpy).toHaveBeenCalledWith(mockRegistration, mockChannel);

      expect(stripRolesSpy).toHaveBeenCalledWith(mockDiscordMember, mockChannel);
    });

    it('should not call stripRoles if discord member has left ', async () => {
      // Mock the Discord service to throw an error, simulating a member that has left
      jest.spyOn(discordService, 'getGuildMember').mockRejectedValue(new Error('Member not found'));

      await service.deregister(mockDiscordMember.id, mockChannel);

      expect(stripRegistrationSpy).toHaveBeenCalledWith(mockRegistration, mockChannel);

      expect(stripRolesSpy).not.toHaveBeenCalled();
    });

    it('should not call stripRegistration or stripRoles if no registration found', async () => {
      // Mock the repository to return no registration
      mockAlbionRegistrationsRepository.findOne = jest.fn().mockResolvedValue([]);

      await service.deregister(mockDiscordMember.id, mockChannel);

      expect(stripRegistrationSpy).not.toHaveBeenCalled();
      expect(stripRolesSpy).not.toHaveBeenCalled();
    });
  });

  describe('stripRegistration', () => {
    it('should remove the registration from the database', async () => {
      const removeAndFlushSpy = jest.spyOn(mockAlbionRegistrationsRepository.getEntityManager(), 'removeAndFlush').mockResolvedValue();

      await service.stripRegistration(mockRegistration, mockChannel);

      expect(removeAndFlushSpy).toHaveBeenCalledWith(mockRegistration);
      expect(mockChannel.send).toHaveBeenCalledWith(`Successfully deregistered Character ${mockRegistration.characterName}.`);
    });

    it('should handle errors when removing registration', async () => {
      const error = new Error('Database error');
      jest.spyOn(mockAlbionRegistrationsRepository.getEntityManager(), 'removeAndFlush').mockRejectedValue(error);

      await service.stripRegistration(mockRegistration, mockChannel);

      expect(mockChannel.send).toHaveBeenCalledWith(`ERROR: Failed to deregister character "${mockRegistration.characterName}" (${mockRegistration.characterId}) from registration database!\nError: "${error.message}". Pinging <@${TestBootstrapper.mockConfig.discord.devUserId}>!`);
    });
  });

  describe('stripRoles', () => {
    const mockRoles = [
      { id: '1218115619732455474', name: 'ALB/Registered' },
      { id: '1218115569455464498', name: 'ALB/Bar' },
    ];

    beforeEach(() => {
      // Set up a mock implementation for the discordService.getRoleViaMember
      jest.spyOn(discordService, 'getRoleViaMember').mockImplementation(async (member, roleId) => {
        // eslint-disable-next-line max-nested-callbacks
        const role = mockRoles.find(searchRole => searchRole.id === roleId);

        return {
          ...role,
          members: {
            has: jest.fn().mockReturnValue(true),
          },
        } as any as Role;
      });
    });

    it('should call remove roles for all roles assigned to member', async () => {
      await service.stripRoles(mockDiscordMember, mockChannel);

      mockRoles.forEach(role => {
        expect(mockDiscordMember.roles.remove).toHaveBeenCalledWith(role.id);
      });
    });

    it('should error if the role operation failed', async () => {
      // Simulate the role removal failing for one of the roles
      jest.spyOn(mockDiscordMember.roles, 'remove').mockImplementationOnce(() => {
        throw new Error('Discord says no');
      });

      await service.stripRoles(mockDiscordMember, mockChannel);

      expect(mockChannel.send).toHaveBeenCalledWith(`ERROR: Unable to remove role "${mockRoles[0].name}" from ${mockDiscordMember.user.username} (${mockDiscordMember.id}). Err: "Discord says no". Pinging <@${TestBootstrapper.mockConfig.discord.devUserId}>!`);
    });

    it('should skip roles the member does not have', async () => {
      // Adjust the mock to simulate the member not having the second role
      jest.spyOn(discordService, 'getRoleViaMember').mockImplementation(async (member, roleId) => {
        // eslint-disable-next-line max-nested-callbacks
        const role = mockRoles.find(searchRole => searchRole.id === roleId);

        return {
          ...role,
          members: {
            has: jest.fn().mockReturnValue(roleId !== mockRoles[1].id), // Member does not have the second role
          },
        } as any as Role;
      });

      await service.stripRoles(mockDiscordMember, mockChannel);

      expect(mockDiscordMember.roles.remove).toHaveBeenCalledWith(mockRoles[0].id);
      expect(mockDiscordMember.roles.remove).not.toHaveBeenCalledWith(mockRoles[1].id); // Should not be called for the second role
    });
  });
});