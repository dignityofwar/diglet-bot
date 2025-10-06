/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from "@nestjs/testing";
import { VoiceStateEvents } from "./voice.state.events";
import { DatabaseService } from "../../database/services/database.service";
import { TestBootstrapper } from "../../test.bootstrapper";

jest.mock("../../database/services/database.service");

describe("VoiceStateEvents", () => {
  let voiceStateEvents: VoiceStateEvents;
  let databaseService: any;
  let mockOldState: any;
  let mockNewState: any;
  let mockUser: any;
  let mockVoiceChannel: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [VoiceStateEvents, DatabaseService],
    }).compile();

    voiceStateEvents = module.get<VoiceStateEvents>(VoiceStateEvents);
    databaseService = module.get<DatabaseService>(DatabaseService);
    databaseService.updateActivity = jest.fn();

    // Mocking VoiceState, GuildMember, User, and VoiceChannel
    mockUser = TestBootstrapper.getMockDiscordUser();
    mockVoiceChannel = TestBootstrapper.getMockDiscordVoiceChannel();
    mockOldState = TestBootstrapper.getMockDiscordVoiceState(mockUser, null);
    mockNewState = TestBootstrapper.getMockDiscordVoiceState(
      mockUser,
      mockVoiceChannel,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("onVoiceStateUpdate", () => {
    it("should handle a user joining a voice channel", async () => {
      await voiceStateEvents.onVoiceStateUpdate(mockOldState, mockNewState);
      expect(databaseService.updateActivity).toHaveBeenCalledWith(
        mockNewState.member,
      );
    });

    it("should handle a user leaving a voice channel", async () => {
      await voiceStateEvents.onVoiceStateUpdate(mockNewState, mockOldState);
      expect(databaseService.updateActivity).toHaveBeenCalledWith(
        mockOldState.member,
      );
    });

    it("should not handle non-channel changes like mute or deafen", async () => {
      mockNewState.channel = mockOldState.channel;
      mockNewState.selfMute = true;
      mockNewState.selfDeaf = true;
      await voiceStateEvents.onVoiceStateUpdate(mockOldState, mockNewState);
      expect(databaseService.updateActivity).not.toHaveBeenCalled();
    });

    it("should not process events for bots", async () => {
      mockNewState.member.user.bot = true;
      await voiceStateEvents.onVoiceStateUpdate(mockOldState, mockNewState);
      expect(databaseService.updateActivity).not.toHaveBeenCalled();
    });
  });
});
