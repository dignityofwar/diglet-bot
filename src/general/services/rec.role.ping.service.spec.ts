/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { RecRolePingService } from './rec.role.ping.service';
import { TestBootstrapper } from '../../test.bootstrapper';
import { Collection } from 'discord.js';

describe('RecRolePingService', () => {
  let service: RecRolePingService;
  let discordService: DiscordService;
  let configService: ConfigService;
  const responseMessage =
    'If you just got pinged, remember our Rec Game pings are opt in. You can opt out here: https://discord.com/channels/90078410642034688/1170026809807622229/1208438379126071296.';

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        RecRolePingService,
        {
          provide: DiscordService,
          useValue: {
            getGuild: jest.fn(),
            getTextChannel: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn(),
          },
        },
      ],
    }).compile();
    TestBootstrapper.setupConfig(moduleRef);

    service = moduleRef.get<RecRolePingService>(RecRolePingService);
    discordService = moduleRef.get<DiscordService>(DiscordService);
    configService = moduleRef.get<ConfigService>(ConfigService);

    jest.spyOn(configService, 'get').mockReturnValue('test-guild-id');

    jest.spyOn(service['logger'], 'error');
    jest.spyOn(service['logger'], 'warn');
    jest.spyOn(service['logger'], 'log');
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('is defined', () => {
    expect(service).toBeDefined();
  });

  describe('onApplicationBootstrap', () => {
    it('should log booting message', async () => {
      // Mock gather roles so it doesn't execute
      service['gatherRoles'] = jest.fn();
      await service.onApplicationBootstrap();
      expect(service['logger'].log).toHaveBeenCalledWith(
        'Booting RecRolePingService...',
      );
    });

    it('should attempt to get guild from DiscordService', async () => {
      const getGuildSpy = jest
        .spyOn(discordService, 'getGuild')
        .mockResolvedValue({
          roles: {
            fetch: jest.fn().mockResolvedValue(new Map()),
          },
        } as any);

      await service.onApplicationBootstrap();
      expect(getGuildSpy).toHaveBeenCalledWith(expect.any(String));
    });

    it('should handle error when fetching guild', async () => {
      jest
        .spyOn(discordService, 'getGuild')
        .mockRejectedValue(new Error('Guild not found'));

      await service.onApplicationBootstrap();
      expect(service['logger'].error).toHaveBeenCalledWith(
        'Failed to fetch guild: Guild not found',
      );
    });

    it('should call gatherRoles', async () => {
      const gatherRolesSpy = jest.spyOn(service, 'gatherRoles');
      const mockGuild = {
        roles: {
          fetch: jest.fn().mockResolvedValue(new Map()),
        },
      } as any;

      jest.spyOn(discordService, 'getGuild').mockResolvedValue(mockGuild);

      await service.onApplicationBootstrap();
      expect(gatherRolesSpy).toHaveBeenCalledWith(mockGuild);
    });
  });

  describe('gatherRoles', () => {
    it('should fail if there are no guild roles', async () => {
      const mockGuild = {
        roles: {
          fetch: jest.fn().mockResolvedValue(new Map()),
        },
      } as any;

      await service.gatherRoles(mockGuild);
      expect(service['logger'].error).toHaveBeenCalledWith(
        'No roles found in the guild',
      );
    });

    it('should error if there are no rec game roles', async () => {
      const mockRoles = new Collection<string, any>(
        new Collection([
          ['1', { id: '1', name: 'other/game1' }],
          ['2', { id: '2', name: 'other/game2' }],
        ]),
      );

      const mockGuild = {
        roles: {
          fetch: jest.fn().mockResolvedValue(mockRoles),
        },
      } as any;

      await service.gatherRoles(mockGuild);
      expect(service['logger'].error).toHaveBeenCalledWith(
        'No rec game roles found in the guild!',
      );
    });

    it('should filter the correct number of roles', async () => {
      const mockRoles = new Collection<string, any>(
        new Collection([
          ['1337', { id: '1337', name: 'rec/game1' }],
          ['2', { id: '2', name: 'other/game2' }],
          ['3', { id: '3', name: 'rec/game3' }],
          ['4', { id: '4', name: 'Rec/PS2/Leader' }],
          ['5', { id: '5', name: 'Rec/PS2/DIGlet' }],
          ['6', { id: '6', name: 'Rec/Helldivers 2' }],
          ['7', { id: '7', name: 'Rec' }],
        ]),
      );

      const mockGuild = {
        roles: {
          fetch: jest.fn().mockResolvedValue(mockRoles),
        },
      } as any;

      const result = await service.gatherRoles(mockGuild);

      expect(result).toEqual(['1337', '3', '6']);
    });
  });

  describe('onMessage', () => {
    // Extend the TestBootstrapper mock message and inject some properties
    const extraProps = {
      content: 'Hello world!',
      channel: {
        send: jest.fn(),
      },
      mentions: {
        size: jest.fn(),
        roles: {
          filter: jest.fn().mockImplementation(() => new Collection()),
        },
      },
    };

    const mockMessage = {
      ...TestBootstrapper.getMockDiscordMessage(),
      ...extraProps,
    } as any;

    it('should error if there are no rec game roles', async () => {
      service['recGameRoleIds'] = [];

      await service.onMessage(mockMessage);

      expect(service['logger'].error).toHaveBeenCalledWith(
        'No rec game roles loaded, skipping message processing.',
      );
    });

    describe('when rec game role IDs are present', () => {
      beforeEach(() => {
        service['recGameRoleIds'] = ['1234', '5678'];
      });

      it('should not send a message if no roles at all were mentioned', async () => {
        mockMessage.mentions.roles = new Collection<string, any>();

        await service.onMessage(mockMessage);

        expect(mockMessage.channel.send).not.toHaveBeenCalled();
      });

      it('should not send a message if no rec roles were mentioned', async () => {
        mockMessage.mentions.roles = new Collection<string, any>([
          ['9999', { id: '9999', name: 'other/game' }],
        ]);

        await service.onMessage(mockMessage);

        expect(mockMessage.channel.send).not.toHaveBeenCalled();
      });

      it('should send a message if rec game role IDs are mentioned', async () => {
        mockMessage.mentions.roles = new Collection<string, any>([
          ['1234', { id: '1234', name: 'Rec/foo' }],
        ]);
        mockMessage.content = 'Hello <@&1234> and <@&5678>!';

        const mockChannel = { send: jest.fn() };
        jest
          .spyOn(discordService, 'getTextChannel')
          .mockResolvedValue(mockChannel as any);

        await service.onMessage(mockMessage);

        expect(discordService.getTextChannel).toHaveBeenCalledWith(
          mockMessage.channel.id,
        );
        expect(mockChannel.send).toHaveBeenCalledWith(responseMessage);
      });
    });
  });
});
