/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigService } from "@nestjs/config";

import { ReflectMetadataProvider } from "@discord-nestjs/core";
import { PS2MembersEntity } from "../../database/entities/ps2.members.entity";
import { EntityManager } from "@mikro-orm/core";
import { getRepositoryToken } from "@mikro-orm/nestjs";
import { TestBootstrapper } from "../../test.bootstrapper";
import {
  ChangesInterface,
  PS2GameScanningService,
} from "./ps2.game.scanning.service";
import { CensusApiService } from "./census.api.service";
import { CensusNotFoundResponse } from "../interfaces/CensusNotFoundResponse";
import { CensusServerError } from "../interfaces/CensusServerError";

const mockCharacterId = "5428010618035323201";
const mockOutfitId = TestBootstrapper.mockConfig.ps2.outfitId;
const mockDevUserId = TestBootstrapper.mockConfig.discord.devUserId;

describe("PS2GameScanningService", () => {
  let service: PS2GameScanningService;
  let mockCensusService: CensusApiService;
  let mockDiscordMessage: any;

  let mockEntityManager: jest.Mocked<EntityManager>;
  let mockPS2Character: any;
  const mockPS2MemberEntity =
    TestBootstrapper.getMockPS2MemberEntity(mockCharacterId);
  let mockPS2MembersRepository: jest.Mocked<any>;

  beforeEach(async () => {
    TestBootstrapper.mockORM();

    mockPS2Character = TestBootstrapper.getMockPS2Character(
      mockCharacterId,
      mockOutfitId,
    );
    mockPS2MembersRepository =
      TestBootstrapper.getMockRepositoryInjected(mockPS2MemberEntity);

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        PS2GameScanningService,
        ReflectMetadataProvider,
        { provide: EntityManager, useValue: mockEntityManager },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
        {
          provide: CensusApiService,
          useValue: {
            getCharacter: jest.fn(),
            getCharacterById: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(PS2MembersEntity),
          useValue: mockPS2MembersRepository,
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<PS2GameScanningService>(PS2GameScanningService);
    mockCensusService = moduleRef.get(
      CensusApiService,
    ) as jest.Mocked<CensusApiService>;

    // Mocks
    mockDiscordMessage = TestBootstrapper.getMockDiscordMessage();

    // Handle map mocking
    // service['monitoringCharacters'] = new Map();
    // service['monitoringCharacters'].set(mockPS2Character.character_id, mockPS2Character);
    // service['messagesMap'] = new Map();
    // service['messagesMap'].set(mockPS2Character.character_id, mockDiscordMessage);
  });

  describe("gatherCharacters", () => {
    it("should gather characters successfully", async () => {
      const outfitMembers = [
        TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId),
        TestBootstrapper.getMockPS2Character(
          `${mockCharacterId}2`,
          mockOutfitId,
        ),
      ];

      mockCensusService.getCharacterById = jest
        .fn()
        .mockResolvedValueOnce(outfitMembers[0])
        .mockResolvedValueOnce(outfitMembers[1]);

      const result = await service.gatherCharacters(
        outfitMembers,
        mockDiscordMessage,
      );

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "Gathering 2 characters from Census...",
      );
      expect(result).toEqual([outfitMembers[0], outfitMembers[1]]);
    });

    it("should handle Census being on its arse, filtering out bad data", async () => {
      const outfitMembers = [
        TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId),
        TestBootstrapper.getMockPS2Character(
          `${mockCharacterId}2`,
          mockOutfitId,
        ),
      ];

      mockCensusService.getCharacterById = jest
        .fn()
        .mockResolvedValueOnce(outfitMembers[0])
        .mockImplementationOnce(() => {
          throw new CensusServerError("Census is dead m9");
        });

      const result = await service.gatherCharacters(
        outfitMembers,
        mockDiscordMessage,
      );

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "Gathering 2 characters from Census...",
      );
      expect(result).toEqual([outfitMembers[0]]);
    });

    it("should handle characters that don't exist", async () => {
      const error = "Character with ID **12345** does not exist.";
      mockCensusService.getCharacterById = jest.fn().mockImplementation(() => {
        throw new CensusNotFoundResponse(error);
      });

      const mockPS2Entity = TestBootstrapper.getMockPS2MemberEntity();

      const result = await service.gatherCharacters(
        [mockPS2Entity],
        mockDiscordMessage,
      );

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        `❌ ${error}`,
      );
      expect(result).toEqual([]);
    });

    it("should handle Census being on its arse", async () => {
      const error = "Census is dead m9";
      mockCensusService.getCharacterById = jest.fn().mockImplementation(() => {
        throw new CensusServerError(error);
      });

      const result = await service.gatherCharacters(
        [TestBootstrapper.getMockPS2Character(mockCharacterId, mockOutfitId)],
        mockDiscordMessage,
      );

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        `❌ ${error}`,
      );
      expect(result).toEqual([]);
    });

    it("should handle partial character returns", async () => {
      const error = "Character with ID **12345** does not exist.";
      const mockCharacter = TestBootstrapper.getMockPS2Character(
        mockCharacterId,
        mockOutfitId,
      );
      mockCensusService.getCharacterById = jest
        .fn()
        .mockImplementationOnce(() => {
          throw new CensusNotFoundResponse(error);
        })
        .mockResolvedValueOnce(mockCharacter);

      const mockPS2Entity = TestBootstrapper.getMockPS2MemberEntity();

      const result = await service.gatherCharacters(
        [mockPS2Entity, mockPS2Entity],
        mockDiscordMessage,
      );

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        `❌ ${error}`,
      );
      expect(result).toEqual([mockCharacter]);
    });
  });

  describe("startScan", () => {
    beforeEach(() => {
      service.reset = jest.fn();
      service.gatherCharacters = jest
        .fn()
        .mockResolvedValue([mockPS2Character]);
      service.verifyMembership = jest.fn().mockResolvedValue(null);
      service.checkForSuggestions = jest.fn().mockResolvedValue(null);
    });
    it("should run through a scan successfully assuming all data is valid", async () => {
      await service.startScan(mockDiscordMessage);

      expect(mockPS2MembersRepository.findAll).toHaveBeenCalledTimes(2);

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith("Starting scan...");

      expect(service.gatherCharacters).toHaveBeenCalledWith(
        [mockPS2MemberEntity],
        mockDiscordMessage,
      );
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "Checking 1 characters for membership status...",
      );
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "Checking 1 characters for role inconsistencies...",
      );

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        "✅ No automatic changes were performed.",
      );
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        "✅ There are currently no inconsistencies between ranks and roles.",
      );
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "ℹ️ There are currently 1 members on record.",
      );
      expect(service.reset).toHaveBeenCalled();
    });

    it("should successfully stop and reset when gatherCharacters returns no characters", async () => {
      service.gatherCharacters = jest.fn().mockReturnValue([]);

      await service.startScan(mockDiscordMessage);

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith("Starting scan...");
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "## ❌ No characters were gathered from Census!",
      );
      expect(service.reset).toHaveBeenCalled();
    });

    it("should successfully catch errors from verifyMembership", async () => {
      service.verifyMembership = jest
        .fn()
        .mockRejectedValue(new Error("Something went wrong!"));

      await service.startScan(mockDiscordMessage);

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "Checking 1 characters for membership status...",
      );
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "## ❌ An error occurred while scanning!",
      );
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        "Error: Something went wrong!",
      );
      expect(service.reset).toHaveBeenCalled();
    });
    it("should successfully catch errors from checkForSuggestions", async () => {
      service.checkForSuggestions = jest
        .fn()
        .mockRejectedValue(new Error("Something went wrong!"));

      await service.startScan(mockDiscordMessage);

      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "Checking 1 characters for role inconsistencies...",
      );
      expect(mockDiscordMessage.edit).toHaveBeenCalledWith(
        "## ❌ An error occurred while scanning!",
      );
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        "Error: Something went wrong!",
      );
      expect(service.reset).toHaveBeenCalled();
    });

    it("should report changes when they are made", async () => {
      const change: ChangesInterface = {
        character: mockPS2Character,
        discordMember: TestBootstrapper.getMockDiscordUser(),
        change: "Changed role to Officer",
      };
      service["changesMap"] = new Map();
      service["changesMap"].set(mockPS2Character.character_id, change);
      await service.startScan(mockDiscordMessage);

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        "## 📝 1 change(s) made",
      );
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith("dummy");

      // No idea how to get the fakeMessage edits, so whatever.
      expect(service.reset).toHaveBeenCalled();
    });

    it("should report suggestions when they are discovered", async () => {
      const suggestion: ChangesInterface = {
        character: mockPS2Character,
        discordMember: TestBootstrapper.getMockDiscordUser(),
        change: "Changed role to Officer",
      };
      service["suggestionsMap"] = new Map();
      service["suggestionsMap"].set(mockPS2Character.character_id, [
        suggestion,
        suggestion,
      ]);
      service["suggestionsCount"] = 2;
      await service.startScan(mockDiscordMessage);

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        "## 👀 2 manual correction(s) to make",
      );
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith("dummy");
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        "🔔 <@&1234567890>, <@&9876543210> Please review the above suggestions and make any necessary changes manually. To check again without pinging Leaders and Officers, run the `/ps2-scan` command with the `dry-run` flag set to `true`.",
      );
      // No idea how to get the fakeMessage edits, so whatever.
      expect(service.reset).toHaveBeenCalled();
    });
  });

  describe("verifyMembership", () => {
    beforeEach(() => {
      service.removeDiscordLeaver = jest.fn();
      service.removeOutfitLeaver = jest.fn();
    });
    it("should not take any action when the character data is empty", async () => {
      await service.verifyMembership(
        [],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false,
      );

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        `❌ Character data for **${mockPS2MemberEntity.characterName}** (${mockPS2MemberEntity.characterId}) did not exist when attempting to verify their membership. Skipping. Pinging <@474839309484>!`,
      );
      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).not.toHaveBeenCalled();
    });

    it("should not take any action when the character is valid", async () => {
      await service.verifyMembership(
        [mockPS2Character],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false,
      );

      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).not.toHaveBeenCalled();
    });

    it("should still take action when a character is missing and notify the dev", async () => {
      const mockPS2MemberEntity2 = TestBootstrapper.getMockPS2MemberEntity(
        `${mockCharacterId}2`,
      );
      const mockPS2Character2 = TestBootstrapper.getMockPS2Character(
        `${mockCharacterId}2`,
        "676879886756",
      );
      const mockDiscordMember = TestBootstrapper.getMockDiscordUser();
      mockDiscordMessage.guild.members.fetch = jest
        .fn()
        .mockResolvedValue(mockDiscordMember);

      await service.verifyMembership(
        [mockPS2Character2],
        [mockPS2MemberEntity, mockPS2MemberEntity2],
        mockDiscordMessage,
        false,
      );

      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        `❌ Character data for **${mockPS2MemberEntity.characterName}** (${mockPS2MemberEntity.characterId}) did not exist when attempting to verify their membership. Skipping. Pinging <@${mockDevUserId}>!`,
      );
      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).toHaveBeenCalledWith(
        mockPS2MemberEntity2,
        mockPS2Character2,
        mockDiscordMember,
        mockDiscordMessage,
        false,
      );
    });

    it("should call the removeOutfitLeaver function if the member has left the outfit", async () => {
      mockPS2Character = TestBootstrapper.getMockPS2Character(
        mockCharacterId,
        "3445576868678",
      );
      const mockDiscordMember = TestBootstrapper.getMockDiscordUser();

      mockDiscordMessage.guild.members.fetch = jest
        .fn()
        .mockResolvedValue(mockDiscordMember);

      await service.verifyMembership(
        [mockPS2Character],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false,
      );

      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).toHaveBeenCalledWith(
        mockPS2MemberEntity,
        mockPS2Character,
        mockDiscordMember,
        mockDiscordMessage,
        false,
      );
    });

    it("should call the removeOutfitLeaver function if the member no longer has an outfit", async () => {
      mockPS2Character = TestBootstrapper.getMockPS2Character(
        mockCharacterId,
        "3445576868678",
      );
      delete mockPS2Character.outfit_info;
      const mockDiscordMember = TestBootstrapper.getMockDiscordUser();

      mockDiscordMessage.guild.members.fetch = jest
        .fn()
        .mockResolvedValue(mockDiscordMember);

      await service.verifyMembership(
        [mockPS2Character],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false,
      );

      expect(service.removeDiscordLeaver).not.toHaveBeenCalled();
      expect(service.removeOutfitLeaver).toHaveBeenCalledWith(
        mockPS2MemberEntity,
        mockPS2Character,
        mockDiscordMember,
        mockDiscordMessage,
        false,
      );
    });

    it("should call the removeDiscordLeaver function if the member has left the server", async () => {
      mockDiscordMessage.guild.members.fetch = jest
        .fn()
        .mockImplementation(() => {
          throw new Error("Who dis?");
        });

      await service.verifyMembership(
        [mockPS2Character],
        [mockPS2MemberEntity],
        mockDiscordMessage,
        false,
      );

      expect(service.removeDiscordLeaver).toHaveBeenCalledWith(
        mockPS2MemberEntity,
        mockPS2Character,
        false,
      );
      expect(service.removeOutfitLeaver).not.toHaveBeenCalled();
    });
  });

  describe("removeDiscordLeaver", () => {
    it("should remove a Discord leaver from the database", async () => {
      jest.spyOn(service["changesMap"], "set");

      await service.removeDiscordLeaver(
        mockPS2MemberEntity,
        mockPS2Character,
        false,
      );

      expect(
        mockPS2MembersRepository.getEntityManager().removeAndFlush,
      ).toHaveBeenCalledWith(mockPS2MemberEntity);
      expect(service["changesMap"].set).toHaveBeenCalledWith(
        mockPS2Character.character_id,
        {
          character: mockPS2Character,
          discordMember: null,
          change: `- 🫥️ Discord member for Character **${mockPS2Character.name.first}** has left the DIG Discord server.`,
        },
      );
    });
    it("should not remove the discord leaver when in dry run", async () => {
      jest.spyOn(service["changesMap"], "set");

      await service.removeDiscordLeaver(
        mockPS2MemberEntity,
        mockPS2Character,
        true,
      );

      expect(
        mockPS2MembersRepository.getEntityManager().removeAndFlush,
      ).toHaveBeenCalledTimes(0);
      expect(service["changesMap"].set).toHaveBeenCalledWith(
        mockPS2Character.character_id,
        {
          character: mockPS2Character,
          discordMember: null,
          change: `- 🫥️ Discord member for Character **${mockPS2Character.name.first}** has left the DIG Discord server.`,
        },
      );
    });
  });

  describe("removeOutfitLeaver", () => {
    it("should not remove an Outfit leaver from the database when in dryrun", async () => {
      jest.spyOn(service["changesMap"], "set");

      const mockDiscordMember = TestBootstrapper.getMockDiscordUser();

      await service.removeOutfitLeaver(
        mockPS2MemberEntity,
        mockPS2Character,
        mockDiscordMember,
        mockDiscordMessage,
        true,
      );

      expect(
        mockPS2MembersRepository.getEntityManager().removeAndFlush,
      ).toHaveBeenCalledTimes(0);
      expect(service["changesMap"].set).toHaveBeenCalledWith(
        mockPS2MemberEntity.characterId,
        {
          character: mockPS2Character,
          discordMember: mockDiscordMember,
          change: `- 👋 <@${mockDiscordMember.id}>'s character **${mockPS2Character.name.first}** has left the outfit. Their roles and verification status have been stripped.`,
        },
      );
    });

    it("should remove an Outfit leaver from the database and strip ranks", async () => {
      jest.spyOn(service["changesMap"], "set");

      const rankMap = TestBootstrapper.mockConfig.ps2.rankMap;
      const mockDiscordMember = TestBootstrapper.getMockDiscordUser();
      const mockVerifiedRankRole = TestBootstrapper.getMockDiscordRole(
        rankMap["@PS2/Verified"].discordRoleId,
      );
      mockVerifiedRankRole.name = "@PS2/Verified";
      const mockOfficerRankRole = TestBootstrapper.getMockDiscordRole(
        rankMap["@PS2/Officer"].discordRoleId,
      );
      mockVerifiedRankRole.name = "@PS2/Officer";

      // Simulate the user having two of the ranks
      mockDiscordMessage.guild.roles.cache.get = jest
        .fn()
        .mockImplementation((roleId) => {
          return (
            roleId === mockVerifiedRankRole.id ||
            roleId === mockOfficerRankRole.id
          );
        });
      mockDiscordMember.roles.cache.has = jest
        .fn()
        .mockImplementation((roleId) => {
          return (
            roleId === mockVerifiedRankRole.id ||
            roleId === mockOfficerRankRole.id
          );
        });

      await service.removeOutfitLeaver(
        mockPS2MemberEntity,
        mockPS2Character,
        mockDiscordMember,
        mockDiscordMessage,
        false,
      );

      // Asset ranks were stripped
      expect(mockDiscordMember.roles.remove).toHaveBeenCalledWith(
        mockVerifiedRankRole.id,
      );
      expect(mockDiscordMember.roles.remove).toHaveBeenCalledWith(
        mockOfficerRankRole.id,
      );
      expect(mockDiscordMember.roles.remove).toHaveBeenCalledTimes(2);

      // Asset the member was removed from the outfit database
      expect(
        mockPS2MembersRepository.getEntityManager().removeAndFlush,
      ).toHaveBeenCalledTimes(1);

      // Asset the change was logged
      expect(service["changesMap"].set).toHaveBeenCalledWith(
        mockPS2MemberEntity.characterId,
        {
          character: mockPS2Character,
          discordMember: mockDiscordMember,
          change: `- 👋 <@${mockDiscordMember.id}>'s character **${mockPS2Character.name.first}** has left the outfit. Their roles and verification status have been stripped.`,
        },
      );
    });

    it("should handle discord role removal errors", async () => {
      const mockDiscordMember = TestBootstrapper.getMockDiscordUser();
      const mockDiscordRole = TestBootstrapper.getMockDiscordRole();
      const rankMap = TestBootstrapper.mockConfig.ps2.rankMap;
      const mockVerifiedRank = rankMap["@PS2/Verified"];

      // Simulate the user having two of the ranks
      mockDiscordMessage.guild.roles.cache.get = jest
        .fn()
        .mockReturnValue(mockDiscordRole);
      mockDiscordMember.roles.cache.has = jest.fn().mockReturnValue(true);

      mockDiscordMember.roles.remove = jest.fn().mockImplementation(() => {
        throw new Error("Discord says no");
      });

      await service.removeOutfitLeaver(
        mockPS2MemberEntity,
        mockPS2Character,
        mockDiscordMember,
        mockDiscordMessage,
        false,
      );

      expect(mockDiscordMember.roles.remove).toHaveBeenCalledWith(
        mockVerifiedRank.discordRoleId,
      );
      expect(mockDiscordMessage.channel.send).toHaveBeenCalledWith(
        `ERROR: Unable to remove role "${mockDiscordRole.name}" from ${mockPS2Character.name.first} (${mockPS2Character.character_id}).\nError: "Discord says no".\nPinging <@${TestBootstrapper.mockConfig.discord.devUserId}>!`,
      );
    });
  });

  describe("checkForSuggestions", () => {
    // Yeahhhh no that is madness to test
  });

  describe("reset", () => {
    beforeEach(() => {
      jest.spyOn(service["charactersMap"], "clear");
      jest.spyOn(service["changesMap"], "clear");
      jest.spyOn(service["suggestionsMap"], "clear");
    });
    it("should reset the service", () => {
      service.reset();

      expect(service["charactersMap"].clear).toHaveBeenCalled();
      expect(service["changesMap"].clear).toHaveBeenCalled();
      expect(service["suggestionsMap"].clear).toHaveBeenCalled();
    });
  });
});
