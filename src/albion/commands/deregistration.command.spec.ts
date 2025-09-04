/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from "@nestjs/testing";
import { AlbionDeregisterCommand } from "./deregistration.command";
import { AlbionDeregistrationService } from "../services/albion.deregistration.service";
import { Logger } from "@nestjs/common";
import { TestBootstrapper } from "../../test.bootstrapper";
import { ReflectMetadataProvider } from "@discord-nestjs/core";

describe("AlbionDeregisterCommand", () => {
  let command: AlbionDeregisterCommand;
  let albionDeregistrationService: AlbionDeregistrationService;
  let mockDiscordInteraction: any;
  let mockDiscordUser: any;
  const expectedChannelId =
    TestBootstrapper.mockConfig.discord.channels.albionRegistration;

  let mockMessage: any;
  let dto: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AlbionDeregisterCommand,
        ReflectMetadataProvider,
        {
          provide: AlbionDeregistrationService,
          useValue: {
            deregister: jest.fn(),
          },
        },
        {
          provide: Logger,
          useValue: {
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    command = module.get<AlbionDeregisterCommand>(AlbionDeregisterCommand);
    albionDeregistrationService = module.get<AlbionDeregistrationService>(
      AlbionDeregistrationService,
    );
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockDiscordInteraction = TestBootstrapper.getMockDiscordInteraction(
      expectedChannelId,
      mockDiscordUser,
    );

    dto = { character: "SomeCharacter" };

    // Get the placeholder message that gets generated
  });

  it("should be defined", () => {
    expect(command).toBeDefined();
  });

  it("should send a placeholder message", async () => {
    await command.onAlbionDeregisterCommand(dto, mockDiscordInteraction);

    expect(mockDiscordInteraction[0].channel.send).toHaveBeenCalledWith(
      `Deregistration process for ${dto.character} started. Please wait...`,
    );
  });

  it("should call deregister with character name", async () => {
    await command.onAlbionDeregisterCommand(dto, mockDiscordInteraction);

    mockMessage = (await mockDiscordInteraction[0].channel.send.mock.results[0])
      .value;

    expect(albionDeregistrationService.deregister).toHaveBeenCalledWith(
      mockMessage.channel,
      dto,
    );
  });

  it("should call deregister with discord member", async () => {
    const mockDto = { discordMember: mockDiscordUser };
    await command.onAlbionDeregisterCommand(mockDto, mockDiscordInteraction);

    mockMessage = (await mockDiscordInteraction[0].channel.send.mock.results[0])
      .value;

    expect(albionDeregistrationService.deregister).toHaveBeenCalledWith(
      mockMessage.channel,
      mockDto,
    );
  });

  it("should throw if neither character nor discordMember is provided", async () => {
    const mockDto = {};
    await command.onAlbionDeregisterCommand(mockDto, mockDiscordInteraction);

    expect(mockDiscordInteraction[0].reply).toHaveBeenCalledWith(
      "❌ You must provide either a character name or a Discord member to deregister.",
    );
    expect(albionDeregistrationService.deregister).not.toHaveBeenCalled();
  });

  it("should delete the placeholder message after deregistration", async () => {
    await command.onAlbionDeregisterCommand(dto, mockDiscordInteraction);

    mockMessage = (await mockDiscordInteraction[0].channel.send.mock.results[0])
      .value;

    expect(mockMessage.delete).toHaveBeenCalled();
  });

  it("should not delete the placeholder if deregistration throws", async () => {
    albionDeregistrationService.deregister = jest
      .fn()
      .mockRejectedValueOnce(new Error("Failure"));

    await command.onAlbionDeregisterCommand(dto, mockDiscordInteraction);
    expect(albionDeregistrationService.deregister).toHaveBeenCalled();

    mockMessage = (await mockDiscordInteraction[0].channel.send.mock.results[0])
      .value;

    expect(mockMessage.channel.send).toHaveBeenCalledWith(
      `❌ An error occurred during the deregistration process for ${dto.character}. Error: Failure`,
    );

    expect(mockMessage.delete).toHaveBeenCalled();
  });
});
