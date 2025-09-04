/* eslint-disable @typescript-eslint/no-explicit-any */
import { AlbionRegistrationsEntity } from "../../database/entities/albion.registrations.entity";
import { AlbionPlayerInterface } from "../interfaces/albion.api.interfaces";
import { TestBootstrapper } from "../../test.bootstrapper";
import { Test } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";
import { getRepositoryToken } from "@mikro-orm/nestjs";
import { EntityRepository } from "@mikro-orm/core";
import { ReflectMetadataProvider } from "@discord-nestjs/core";
import { AlbionDeregistrationService } from "./albion.deregistration.service";
import { DiscordService } from "../../discord/discord.service";
import { AlbionDeregisterDto } from "../dto/albion.deregister.dto";
import { Role } from "discord.js";

let mockAlbionRegistrationsRepository: jest.Mocked<
  EntityRepository<AlbionRegistrationsEntity>
>;

let mockRegistration: AlbionRegistrationsEntity;
let mockCharacter: AlbionPlayerInterface;
let mockChannel: any;
let mockDiscordMember: any;

describe("AlbionDeregistrationService", () => {
  let service: AlbionDeregistrationService;
  let discordService: jest.Mocked<DiscordService>;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(async () => {
    mockCharacter = TestBootstrapper.getMockAlbionCharacter();

    mockRegistration = {
      id: 123456789,
      discordId: "123456789",
      characterId: mockCharacter.Id,
      characterName: mockCharacter.Name,
      guildId: mockCharacter.GuildId,
      manual: false,
      manualCreatedByDiscordId: null,
      manualCreatedByDiscordName: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as AlbionRegistrationsEntity;

    mockAlbionRegistrationsRepository =
      TestBootstrapper.getMockRepositoryInjected(mockRegistration) as any;
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

    service = moduleRef.get<AlbionDeregistrationService>(
      AlbionDeregistrationService,
    );
    discordService = moduleRef.get(DiscordService) as any;
    configService = moduleRef.get(ConfigService) as any;

    // Ensure albion.roleMap + devUserId available for role stripping tests
    (configService.get as jest.Mock).mockImplementation((key: string) => {
      if (key === "albion.roleMap") {
        return {
          registered: { discordRoleId: "1218115619732455474" },
          bar: { discordRoleId: "1218115569455464498" },
        };
      }
      if (key === "discord.devUserId") {
        return TestBootstrapper.mockConfig.discord.devUserId;
      }
      return undefined;
    });
  });

  describe("deregister (validation + branching)", () => {
    let stripRegistrationSpy: jest.SpyInstance;
    let stripRolesSpy: jest.SpyInstance;

    beforeEach(() => {
      jest.clearAllMocks();
      stripRegistrationSpy = jest
        .spyOn(service, "stripRegistration")
        .mockResolvedValue();
      stripRolesSpy = jest.spyOn(service, "stripRoles").mockResolvedValue();
      discordService.getGuildMember.mockResolvedValue(mockDiscordMember);
      mockAlbionRegistrationsRepository.findOne = jest
        .fn()
        .mockResolvedValue(mockRegistration);
    });

    it("should throw if neither character nor discordMember provided", async () => {
      const dto: AlbionDeregisterDto = {};
      await expect(service.deregister(mockChannel, dto)).rejects.toThrow(
        "Either character or discordId must be provided for deregistration.",
      );
      expect(stripRegistrationSpy).not.toHaveBeenCalled();
      expect(stripRolesSpy).not.toHaveBeenCalled();
      expect(mockChannel.send).not.toHaveBeenCalled();
    });

    it("should deregister via discordMember", async () => {
      const dto: AlbionDeregisterDto = { discordMember: mockDiscordMember.id };
      mockAlbionRegistrationsRepository.findOne.mockResolvedValueOnce(
        mockRegistration,
      );

      await service.deregister(mockChannel, dto);

      expect(mockAlbionRegistrationsRepository.findOne).toHaveBeenCalledWith({
        discordId: dto.discordMember,
      });
      expect(discordService.getGuildMember).toHaveBeenCalledWith(
        mockChannel.guild.id,
        mockRegistration.discordId,
        true,
      );
      expect(stripRegistrationSpy).toHaveBeenCalledWith(
        mockRegistration,
        mockChannel,
      );
      expect(stripRolesSpy).toHaveBeenCalledWith(
        mockDiscordMember,
        mockChannel,
      );
    });

    it("should send not found message for discordMember path", async () => {
      const dto: AlbionDeregisterDto = { discordMember: mockDiscordMember.id };
      mockAlbionRegistrationsRepository.findOne.mockResolvedValueOnce(null);

      await service.deregister(mockChannel, dto);

      expect(mockChannel.send).toHaveBeenCalledWith(
        `❌ No registration found for Discord User ID "${mockDiscordMember.id}"!`,
      );
      expect(stripRegistrationSpy).not.toHaveBeenCalled();
      expect(stripRolesSpy).not.toHaveBeenCalled();
    });

    it("should deregister via character and fetch member", async () => {
      const dto: AlbionDeregisterDto = {
        character: mockRegistration.characterName,
      };
      mockAlbionRegistrationsRepository.findOne.mockImplementation(
        async (criteria: any) => {
          if (criteria.characterName === mockRegistration.characterName) {
            return mockRegistration;
          }
          return null;
        },
      );

      await service.deregister(mockChannel, dto);

      expect(mockAlbionRegistrationsRepository.findOne).toHaveBeenCalledWith({
        characterName: mockRegistration.characterName,
      });
      expect(discordService.getGuildMember).toHaveBeenCalledWith(
        mockChannel.guild.id,
        mockRegistration.discordId,
        true,
      );
      expect(stripRegistrationSpy).toHaveBeenCalledWith(
        mockRegistration,
        mockChannel,
      );
      expect(stripRolesSpy).toHaveBeenCalledWith(
        mockDiscordMember,
        mockChannel,
      );
    });

    it("should send not found message for character path", async () => {
      const dto: AlbionDeregisterDto = { character: "MissingChar" };
      mockAlbionRegistrationsRepository.findOne.mockResolvedValueOnce(null);

      await service.deregister(mockChannel, dto);

      expect(mockChannel.send).toHaveBeenCalledWith(
        '❌ No registration found for character "MissingChar"!',
      );
      expect(stripRegistrationSpy).not.toHaveBeenCalled();
      expect(stripRolesSpy).not.toHaveBeenCalled();
    });

    it("should skip role stripping if member fetch fails (character path)", async () => {
      const dto: AlbionDeregisterDto = {
        character: mockRegistration.characterName,
      };
      mockAlbionRegistrationsRepository.findOne.mockResolvedValueOnce(
        mockRegistration,
      );
      discordService.getGuildMember.mockRejectedValueOnce(new Error("Gone"));

      await service.deregister(mockChannel, dto);

      expect(stripRegistrationSpy).toHaveBeenCalledWith(
        mockRegistration,
        mockChannel,
      );
      expect(stripRolesSpy).not.toHaveBeenCalled();
      expect(mockChannel.send).toHaveBeenCalledWith(
        expect.stringContaining("⚠️ Discord Member with ID"),
      );
    });
  });

  describe("stripRegistration", () => {
    it("should remove registration and confirm", async () => {
      const removeAndFlushSpy = jest
        .spyOn(
          mockAlbionRegistrationsRepository.getEntityManager(),
          "removeAndFlush",
        )
        .mockResolvedValue();

      await service.stripRegistration(mockRegistration, mockChannel);

      expect(removeAndFlushSpy).toHaveBeenCalledWith(mockRegistration);
      expect(mockChannel.send).toHaveBeenCalledWith(
        `Successfully deregistered Character ${mockRegistration.characterName}.`,
      );
    });

    it("should report error on failure", async () => {
      const error = new Error("DB fail");
      jest
        .spyOn(
          mockAlbionRegistrationsRepository.getEntityManager(),
          "removeAndFlush",
        )
        .mockRejectedValue(error);

      await service.stripRegistration(mockRegistration, mockChannel);

      expect(mockChannel.send).toHaveBeenCalledWith(
        `ERROR: Failed to deregister character "${mockRegistration.characterName}" (${mockRegistration.characterId}) from registration database!\nError: "${error.message}". Pinging <@${TestBootstrapper.mockConfig.discord.devUserId}>!`,
      );
    });
  });

  describe("stripRoles", () => {
    const mockRoles = [
      { id: "1218115619732455474", name: "ALB/Registered" },
      { id: "1218115569455464498", name: "ALB/Bar" },
    ];

    beforeEach(() => {
      jest.clearAllMocks();
      discordService.getRoleViaMember.mockImplementation(
        async (_member: any, roleId: string) => {
          // eslint-disable-next-line max-nested-callbacks
          const found = mockRoles.find((r) => r.id === roleId);
          return {
            ...found,
            members: {
              has: jest.fn().mockReturnValue(true),
            },
          } as any as Role;
        },
      );
    });

    it("should remove all mapped roles the member still has", async () => {
      await service.stripRoles(mockDiscordMember, mockChannel);
      expect(mockDiscordMember.roles.remove).toHaveBeenCalledWith(
        mockRoles[0].id,
      );
      expect(mockDiscordMember.roles.remove).toHaveBeenCalledWith(
        mockRoles[1].id,
      );
    });

    it("should skip roles not present on member", async () => {
      discordService.getRoleViaMember.mockImplementation(
        async (_m: any, roleId: string) => {
          // eslint-disable-next-line max-nested-callbacks
          const found = mockRoles.find((r) => r.id === roleId);
          return {
            ...found,
            members: {
              has: jest.fn().mockReturnValue(roleId === mockRoles[0].id),
            },
          } as any as Role;
        },
      );

      await service.stripRoles(mockDiscordMember, mockChannel);

      expect(mockDiscordMember.roles.remove).toHaveBeenCalledWith(
        mockRoles[0].id,
      );
      expect(mockDiscordMember.roles.remove).not.toHaveBeenCalledWith(
        mockRoles[1].id,
      );
    });

    it("should report an error if a role removal throws", async () => {
      (mockDiscordMember.roles.remove as jest.Mock).mockImplementationOnce(
        () => {
          throw new Error("Discord says no");
        },
      );

      await service.stripRoles(mockDiscordMember, mockChannel);

      expect(mockChannel.send).toHaveBeenCalledWith(
        `ERROR: Unable to remove role "${mockRoles[0].name}" from ${mockDiscordMember.user.username} (${mockDiscordMember.id}). Err: "Discord says no". Pinging <@${TestBootstrapper.mockConfig.discord.devUserId}>!`,
      );
    });
  });
});
