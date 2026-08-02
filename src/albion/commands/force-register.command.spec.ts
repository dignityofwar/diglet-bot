/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { MessageFlags } from 'discord.js';
import { AlbionForceRegisterCommand } from './force-register.command';
import { AlbionForceRegistrationService } from '../services/albion.force.registration.service';
import { AlbionUtilities } from '../utilities/albion.utilities';

const discordMemberId = '90078072660852736';
const characterName = 'Maelstromeous';

const createInteraction = () => ({
  guildId: 'discord-guild-id',
  member: { id: 'staff-id', roles: { cache: new Map() } },
  deferred: true,
  replied: false,
  deferReply: jest.fn().mockResolvedValue(undefined),
  editReply: jest.fn().mockResolvedValue(undefined),
  reply: jest.fn().mockResolvedValue(undefined),
}) as any;

describe('AlbionForceRegisterCommand', () => {
  let command: AlbionForceRegisterCommand;
  let forceRegistrationService: any;
  let albionUtilities: any;
  let interaction: any;

  const dto: any = {
    character: characterName,
    discordMember: { id: discordMemberId },
  };

  beforeEach(async () => {
    forceRegistrationService = {
      forceRegister: jest.fn().mockResolvedValue({
        characterName,
        characterId: 'character-id-123',
        discordMember: { id: discordMemberId },
        queueResolved: false,
      }),
    };

    albionUtilities = {
      isElector: jest.fn().mockReturnValue(true),
    };

    const moduleRef = await Test.createTestingModule({
      providers: [
        AlbionForceRegisterCommand,
        {
          provide: AlbionForceRegistrationService,
          useValue: forceRegistrationService,
        },
        {
          provide: AlbionUtilities,
          useValue: albionUtilities,
        },
      ],
    }).compile();

    command = moduleRef.get(AlbionForceRegisterCommand);
    interaction = createInteraction();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should refuse members below Eldritch Mage', async () => {
    albionUtilities.isElector.mockReturnValue(false);

    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(result).toContain('You do not have permission to run this command');
    expect(forceRegistrationService.forceRegister).not.toHaveBeenCalled();
  });

  it('should keep the refusal private to whoever tried it', async () => {
    albionUtilities.isElector.mockReturnValue(false);

    await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(interaction.reply).toHaveBeenCalledWith(
      expect.objectContaining({ flags: MessageFlags.Ephemeral }),
    );
    expect(interaction.deferReply).not.toHaveBeenCalled();
  });

  it('should fail closed when there is no guild member to check, such as in a DM', async () => {
    interaction.member = null;

    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(result).toContain('You do not have permission to run this command');
    expect(albionUtilities.isElector).not.toHaveBeenCalled();
    expect(forceRegistrationService.forceRegister).not.toHaveBeenCalled();
  });

  it('should fail closed when the member arrives without a resolved role cache', async () => {
    // Discord hands back an APIInteractionGuildMember, whose roles are a plain ID array.
    interaction.member = { id: 'staff-id', roles: ['1218115619732455474'] };

    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(result).toContain('You do not have permission to run this command');
    expect(forceRegistrationService.forceRegister).not.toHaveBeenCalled();
  });

  it('should check the permission against the member who ran it', async () => {
    await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(albionUtilities.isElector).toHaveBeenCalledWith(interaction.member);
  });

  it('should defer the reply before doing any work', async () => {
    await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(interaction.deferReply).toHaveBeenCalledTimes(1);
  });

  it('should force register the character for the supplied member', async () => {
    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(forceRegistrationService.forceRegister).toHaveBeenCalledWith(
      characterName,
      discordMemberId,
      'discord-guild-id',
      interaction.member,
    );
    expect(result).toContain(`✅ **${characterName}** has been force registered to <@${discordMemberId}>`);
    expect(result).toContain('@ALB/Disciple');
  });

  it('should warn that the scan will still remove them if they are not in the guild', async () => {
    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(result).toContain('the next scan will strip them if they are not actually in the guild');
  });

  it('should say when a queued attempt was closed out', async () => {
    forceRegistrationService.forceRegister.mockResolvedValue({
      characterName,
      characterId: 'character-id-123',
      discordMember: { id: discordMemberId },
      queueResolved: true,
    });

    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(result).toContain('queued registration attempt has been marked as succeeded');
  });

  it('should not mention the queue when nothing was queued', async () => {
    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(result).not.toContain('queued registration attempt');
  });

  it('should warn rather than fail when the queue could not be closed out', async () => {
    forceRegistrationService.forceRegister.mockResolvedValue({
      characterName,
      characterId: 'character-id-123',
      discordMember: { id: discordMemberId },
      queueResolved: false,
      queueError: 'Duplicate entry',
    });

    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(result).toContain('has been force registered');
    expect(result).toContain('queued registration attempt could not be closed out');
    expect(result).toContain('Duplicate entry');
  });

  it('should report the error when registration fails', async () => {
    forceRegistrationService.forceRegister.mockRejectedValue(new Error('already registered'));

    const result = await command.onAlbionForceRegisterCommand(dto, [interaction]);

    expect(result).toBe('⛔️ **ERROR:** already registered');
  });
});
