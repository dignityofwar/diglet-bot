/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { MessageEvents } from './message.events';
import { DatabaseService } from '../../database/services/database.service';
import { TestBootstrapper } from '../../test.bootstrapper';
import { RecRolePingService } from '../services/rec.role.ping.service';

jest.mock('../../database/services/database.service');

describe('MessageEvents', () => {
  let messageEvents: MessageEvents;
  let databaseService: any;
  let recRolePingService: RecRolePingService;

  let mockMessage: any;
  let mockUser: any;
  let mockMessageReaction: any;
  let mockGuildMember: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessageEvents,
        {
          provide: DatabaseService,
          useValue: {
            updateActivity: jest.fn(),
          },
        },
        {
          provide: RecRolePingService,
          useValue: {
            onMessage: jest.fn(),
          },
        },
      ],
    }).compile();

    messageEvents = module.get<MessageEvents>(MessageEvents);
    databaseService = module.get<DatabaseService>(DatabaseService);
    recRolePingService = module.get<RecRolePingService>(RecRolePingService);

    // Mocking Discord.js objects
    mockUser = TestBootstrapper.getMockDiscordUser();
    mockGuildMember = TestBootstrapper.getMockDiscordUser();
    mockMessage = TestBootstrapper.getMockDiscordMessage();
    mockMessageReaction = TestBootstrapper.getMockDiscordMessageReaction();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('handleMessageEvent', () => {
    it('should handle a message event for a non-bot user', async () => {
      await messageEvents.handleMessageEvent(mockMessage, 'create');

      expect(databaseService.updateActivity).toHaveBeenCalledWith(mockMessage.member);
      expect(recRolePingService.onMessage).toHaveBeenCalledWith(mockMessage);
    });

    it('should not handle message events for bot users', async () => {
      mockMessage.member.user.bot = true;

      await messageEvents.handleMessageEvent(mockMessage, 'create');

      expect(databaseService.updateActivity).not.toHaveBeenCalled();
      expect(recRolePingService.onMessage).not.toHaveBeenCalled();
    });

    it('should handle message events null users', async () => {
      mockMessage.member.user = null;
      await expect(messageEvents.handleMessageEvent(mockMessage, 'create')).rejects.toThrow('Message create event could not be processed as the GuildMember was not found.');
      await expect(messageEvents.handleMessageEvent(mockMessage, 'update')).rejects.toThrow('Message update event could not be processed as the GuildMember was not found.');
      await expect(messageEvents.handleMessageEvent(mockMessage, 'delete')).rejects.toThrow('Message delete event could not be processed as the GuildMember was not found.');
    });

    const eventTypes = ['create', 'update', 'delete'];
    const memberDetails = [
      { detail: 'displayName', value: null },
      { detail: 'nickname', value: null },
      { detail: 'username', value: null },
    ];

    memberDetails.forEach(({ detail, value }) => {
      it(`should handle message events with no ${detail} on GuildMember`, async () => {
        mockMessage.member.displayName = null;
        mockMessage.member.nickname = null;
        mockMessage.member.user.username = null;
        if (detail === 'nickname') {
          mockGuildMember.nickname = value;
        }
        else {
          mockGuildMember.user.username = value;
        }

        for (const type of eventTypes) {
          await expect(messageEvents.handleMessageEvent(mockMessage, type)).rejects.toThrowError(`Message ${type} event could not be processed as member ID "${mockGuildMember.id}" does not have a name!`);
          expect(databaseService.updateActivity).not.toHaveBeenCalled();
        }
      });
    });
  });

  describe('handleMessageReaction', () => {
    it('should handle a message reaction for a non-bot user', async () => {
      mockMessage.guild.members.cache.get = jest.fn().mockReturnValue(mockGuildMember);
      await messageEvents.handleMessageReaction(mockMessageReaction, mockUser, 'add');
      expect(databaseService.updateActivity).toHaveBeenCalled();
    });

    it('should not handle message reactions for bot users', async () => {
      mockUser.bot = true;
      await messageEvents.handleMessageReaction(mockMessageReaction, mockUser, 'add');
      expect(databaseService.updateActivity).not.toHaveBeenCalled();
    });

    it('should return early when no GuildMember was found', async () => {
      mockMessageReaction.message.guild.members.cache.get = jest.fn().mockReturnValue(undefined);
      expect(await messageEvents.handleMessageReaction(mockMessageReaction, mockUser, 'add')).toBe(undefined);
      expect(databaseService.updateActivity).not.toHaveBeenCalled();
    });
  });

  describe('handlePartialReactions', () => {
    it('should handle full reactions without fetching', async () => {
      const result = await messageEvents.handlePartialReactions(mockMessageReaction, mockUser);
      expect(result.reaction).toBe(mockMessageReaction);
      expect(result.user).toBe(mockUser);
      expect(mockMessageReaction.fetch).not.toHaveBeenCalled();
    });

    it('should fetch partial reactions', async () => {
      mockMessageReaction.partial = true;
      mockMessageReaction.fetch.mockResolvedValue(mockMessageReaction);

      const result = await messageEvents.handlePartialReactions(mockMessageReaction, mockUser);
      expect(result.reaction).toBe(mockMessageReaction);
      expect(mockMessageReaction.fetch).toHaveBeenCalled();
    });
  });

  describe('Event Handlers', () => {
    it('should handle message creation', async () => {
      await messageEvents.onMessageCreate(mockMessage);
      expect(databaseService.updateActivity).toHaveBeenCalledWith(mockMessage.member);
    });
    it('should handle message creation from a bot', async () => {
      mockMessage.member = TestBootstrapper.getMockDiscordUser(true);
      await messageEvents.onMessageCreate(mockMessage);
      expect(databaseService.updateActivity).toHaveBeenCalledTimes(0);
    });

    it('should handle message update', async () => {
      await messageEvents.onMessageUpdate(mockMessage);
      expect(databaseService.updateActivity).toHaveBeenCalledWith(mockMessage.member);
    });

    it('should handle message deletion', async () => {
      await messageEvents.onMessageDelete(mockMessage);
      expect(databaseService.updateActivity).toHaveBeenCalledWith(mockMessage.member);
    });

    it('should handle message reaction addition', async () => {
      mockMessageReaction.partial = false; // assuming this is a full reaction

      await messageEvents.onMessageReactionAdd(mockMessageReaction, mockUser);

      expect(mockMessageReaction.fetch).not.toHaveBeenCalled(); // since it's a full reaction
      expect(databaseService.updateActivity).toHaveBeenCalledTimes(1);
    });

    it('should handle message reaction addition from a bot', async () => {
      mockMessageReaction.partial = false; // assuming this is a full reaction
      mockUser.bot = true; // assuming this is a bot user

      await messageEvents.onMessageReactionAdd(mockMessageReaction, mockUser);

      expect(databaseService.updateActivity).toHaveBeenCalledTimes(0);
    });

    it('should handle message reaction removal', async () => {
      mockMessageReaction.partial = false; // assuming this is a full reaction
      mockUser.bot = false; // assuming this is a non-bot user

      await messageEvents.onMessageReactionRemove(mockMessageReaction, mockUser);

      expect(mockMessageReaction.fetch).not.toHaveBeenCalled(); // since it's a full reaction
      expect(databaseService.updateActivity).toHaveBeenCalledTimes(1); // exact args depend on your implementation
    });
  });
});
