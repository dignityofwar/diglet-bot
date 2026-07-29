/* eslint-disable @typescript-eslint/no-explicit-any */
import { replyTo } from './discord.hacks';

describe('discord.hacks', () => {
  const mockInteraction = (overrides: any = {}): any => ({
    deferred: false,
    replied: false,
    reply: jest.fn(),
    editReply: jest.fn(),
    ...overrides,
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('replyTo', () => {
    it('should reply directly when the interaction has not been deferred', async () => {
      const interaction = mockInteraction();
      await replyTo(interaction, 'hello');
      expect(interaction.reply).toHaveBeenCalledWith('hello');
      expect(interaction.editReply).not.toHaveBeenCalled();
    });

    // Replying to a deferred interaction throws, so it has to be edited instead.
    it('should edit the reply when the interaction was deferred', async () => {
      const interaction = mockInteraction({ deferred: true });
      await replyTo(interaction, 'hello');
      expect(interaction.editReply).toHaveBeenCalledWith('hello');
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('should edit the reply when the interaction was already replied to', async () => {
      const interaction = mockInteraction({ replied: true });
      await replyTo(interaction, 'hello');
      expect(interaction.editReply).toHaveBeenCalledWith('hello');
      expect(interaction.reply).not.toHaveBeenCalled();
    });

    it('should return the content it sent', async () => {
      expect(await replyTo(mockInteraction(), 'echoed')).toBe('echoed');
    });
  });
});
