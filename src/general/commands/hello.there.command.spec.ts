/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test, TestingModule } from '@nestjs/testing';
import { HelloThereCommand } from './hello.there.command';
import { TestBootstrapper } from '../../test.bootstrapper';

describe('HelloThereCommand', () => {
  let command: HelloThereCommand;
  let mockInteraction: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [HelloThereCommand],
    }).compile();

    command = module.get<HelloThereCommand>(HelloThereCommand);
    // Don't actually wait 5 seconds in the suite.
    command['delay'] = jest.fn().mockResolvedValue(undefined);

    mockInteraction = TestBootstrapper.getMockDiscordInteraction(
      '1234',
      TestBootstrapper.getMockDiscordUser(),
    )[0];
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('onHelloThereCommand', () => {
    it('should defer before doing the slow work', async () => {
      await command.onHelloThereCommand([mockInteraction]);
      expect(mockInteraction.deferReply).toHaveBeenCalled();
    });

    it('should reply with the expected greeting', async () => {
      await command.onHelloThereCommand([mockInteraction]);
      expect(mockInteraction.reply).toHaveBeenCalledWith('General Kenobi!');
    });

    // The whole point of the command: the wait must exceed Discord's 3s window.
    it('should wait longer than the interaction acknowledgement window', async () => {
      await command.onHelloThereCommand([mockInteraction]);
      const waited = (command['delay'] as jest.Mock).mock.calls[0][0];
      expect(waited).toBeGreaterThan(3000);
    });

    it('should defer before waiting, not after', async () => {
      const order: string[] = [];
      mockInteraction.deferReply = jest.fn(() => { order.push('defer'); });
      command['delay'] = jest.fn(() => {
        order.push('wait');
        return Promise.resolve();
      });

      await command.onHelloThereCommand([mockInteraction]);
      expect(order).toEqual(['defer', 'wait']);
    });
  });
});
