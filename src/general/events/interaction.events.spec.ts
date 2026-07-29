/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { Logger } from '@nestjs/common';
import { InteractionEvents } from './interaction.events';

describe('InteractionEvents', () => {
  let interactionEvents: InteractionEvents;
  let logSpy: jest.SpyInstance;

  const mockInteraction = (overrides: any = {}): any => ({
    isChatInputCommand: () => true,
    commandName: 'albion-scan',
    channelId: '1155997486318620746',
    user: { username: 'digletuser', id: '90078072660852736' },
    options: { data: [] },
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InteractionEvents],
    }).compile();

    interactionEvents = module.get<InteractionEvents>(InteractionEvents);
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('onInteractionCreate', () => {
    it('should ignore interactions that are not chat input commands', () => {
      interactionEvents.onInteractionCreate([
        mockInteraction({ isChatInputCommand: () => false }),
      ]);
      expect(logSpy).not.toHaveBeenCalled();
    });

    it('should log the command, caller and channel when there are no arguments', () => {
      interactionEvents.onInteractionCreate([mockInteraction()]);
      expect(logSpy).toHaveBeenCalledWith(
        '/albion-scan by digletuser (90078072660852736) in channel 1155997486318620746 args: none',
      );
    });

    it('should log scalar argument values', () => {
      interactionEvents.onInteractionCreate([
        mockInteraction({
          options: { data: [{ name: 'character-name', value: 'Maelstromeous' }] },
        }),
      ]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('args: character-name=Maelstromeous'));
    });

    // A false boolean is the case a truthiness check would silently drop.
    it('should log a false boolean argument rather than omitting it', () => {
      interactionEvents.onInteractionCreate([
        mockInteraction({ options: { data: [{ name: 'dry-run', value: false }] } }),
      ]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('args: dry-run=false'));
    });

    it('should log a user argument as username and id, not the raw object', () => {
      interactionEvents.onInteractionCreate([
        mockInteraction({
          options: {
            data: [
              {
                name: 'discord-user',
                value: '123456789',
                user: { username: 'targetuser', id: '123456789' },
              },
            ],
          },
        }),
      ]);
      expect(logSpy).toHaveBeenCalledWith(
        expect.stringContaining('args: discord-user=@targetuser(123456789)'),
      );
      expect(logSpy).not.toHaveBeenCalledWith(expect.stringContaining('[object Object]'));
    });

    it('should log channel and role arguments by id', () => {
      interactionEvents.onInteractionCreate([
        mockInteraction({
          options: {
            data: [
              { name: 'target-channel', value: '111', channel: { id: '111' } },
              { name: 'target-role', value: '222', role: { id: '222' } },
            ],
          },
        }),
      ]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('target-channel=#111 target-role=&222'));
    });

    it('should flatten nested subcommand options', () => {
      interactionEvents.onInteractionCreate([
        mockInteraction({
          options: {
            data: [{ name: 'add', options: [{ name: 'character-name', value: 'Foo' }] }],
          },
        }),
      ]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('args: add(character-name=Foo)'));
    });

    it('should report a missing value as null', () => {
      interactionEvents.onInteractionCreate([
        mockInteraction({ options: { data: [{ name: 'dry-run', value: undefined }] } }),
      ]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('args: dry-run=null'));
    });

    it('should describe a DM as such when there is no channel', () => {
      interactionEvents.onInteractionCreate([mockInteraction({ channelId: null })]);
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('in DM args: none'));
    });
  });
});
