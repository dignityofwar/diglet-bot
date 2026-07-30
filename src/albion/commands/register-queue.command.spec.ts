/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AlbionRegisterQueueCommand } from './register-queue.command';
import { AlbionRegistrationQueueService } from '../services/albion.registration.queue.service';
import { DiscordService } from '../../discord/discord.service';
import { TestBootstrapper } from '../../test.bootstrapper';

const registrationChannelId = TestBootstrapper.mockConfig.discord.channels.albionRegistration;
const discordMemberId = '90078072660852736';
const characterName = 'Maelstromeous';
const expiresAt = new Date('2026-08-02T12:00:00Z');
const expiresDiscordTime = `<t:${Math.floor(expiresAt.getTime() / 1000)}:f>`;

const createInteraction = () => ({
  guildId: 'discord-guild-id',
  deferred: true,
  replied: false,
  deferReply: jest.fn().mockResolvedValue(undefined),
  editReply: jest.fn().mockResolvedValue(undefined),
  reply: jest.fn().mockResolvedValue(undefined),
}) as any;

describe('AlbionRegisterQueueCommand', () => {
  let command: AlbionRegisterQueueCommand;
  let queueService: any;
  let discordService: any;
  let registrationChannel: any;
  let interaction: any;

  const dto: any = {
    character: characterName,
    discordMember: { id: discordMemberId },
  };

  beforeEach(async () => {
    registrationChannel = {
      ...TestBootstrapper.getMockDiscordTextChannel(),
      send: jest.fn().mockResolvedValue(undefined),
    };

    queueService = {
      forceQueue: jest.fn().mockResolvedValue({
        characterName,
        discordMember: { id: discordMemberId },
        expiresAt,
        requeued: false,
      }),
    };

    discordService = {
      getTextChannel: jest.fn().mockResolvedValue(registrationChannel),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionRegisterQueueCommand,
        {
          provide: ConfigService,
          useValue: { get: jest.fn() },
        },
        {
          provide: DiscordService,
          useValue: discordService,
        },
        {
          provide: AlbionRegistrationQueueService,
          useValue: queueService,
        },
      ],
    }).compile();

    TestBootstrapper.setupConfig(moduleRef);

    command = moduleRef.get(AlbionRegisterQueueCommand);
    interaction = createInteraction();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should defer the reply before doing any work', async () => {
    await command.onAlbionRegisterQueueCommand(dto, [interaction]);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
  });

  it('should queue the character for the supplied member', async () => {
    const result = await command.onAlbionRegisterQueueCommand(dto, [interaction]);

    expect(queueService.forceQueue).toHaveBeenCalledWith(
      characterName,
      discordMemberId,
      'discord-guild-id',
    );
    expect(result).toBe(
      `✅ **${characterName}** has been queued for <@${discordMemberId}>. It will be retried hourly until ${expiresDiscordTime}.`,
    );
  });

  it('should say re-queued when an existing attempt was updated', async () => {
    queueService.forceQueue.mockResolvedValue({
      characterName,
      discordMember: { id: discordMemberId },
      expiresAt,
      requeued: true,
    });

    const result = await command.onAlbionRegisterQueueCommand(dto, [interaction]);

    expect(result).toContain('has been re-queued for');
  });

  it('should ping the member in the registration channel', async () => {
    await command.onAlbionRegisterQueueCommand(dto, [interaction]);

    expect(discordService.getTextChannel).toHaveBeenCalledWith(registrationChannelId);
    expect(registrationChannel.send).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining(`<@${discordMemberId}> you have been added to the Albion registration retry system!`),
        allowedMentions: { users: [discordMemberId] },
      }),
    );
  });

  it('should tell the member the retry cadence and expiry', async () => {
    await command.onAlbionRegisterQueueCommand(dto, [interaction]);

    const { content } = registrationChannel.send.mock.calls[0][0];
    expect(content).toContain(`**${characterName}**`);
    expect(content).toContain('**once every hour for the next 3 days**');
    expect(content).toContain(expiresDiscordTime);
  });

  it('should still report success if the member notification fails', async () => {
    discordService.getTextChannel.mockRejectedValue(new Error('no channel'));

    const result = await command.onAlbionRegisterQueueCommand(dto, [interaction]);

    expect(result).toContain('has been queued for');
  });

  it('should report the error and not notify when queueing fails', async () => {
    queueService.forceQueue.mockRejectedValue(new Error('already registered'));

    const result = await command.onAlbionRegisterQueueCommand(dto, [interaction]);

    expect(result).toBe('⛔️ **ERROR:** already registered');
    expect(registrationChannel.send).not.toHaveBeenCalled();
  });
});
