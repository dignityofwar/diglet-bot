/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { MessageFlags } from 'discord.js';
import { TestBootstrapper } from '../../test.bootstrapper';
import { ActivityCommand } from './activity.command';
import { MemberActivityReportService } from '../services/member.activity.report.service';

describe('ActivityCommand', () => {
  let command: ActivityCommand;
  let reportService: MemberActivityReportService;
  let mockInteraction: any;
  let mockDiscordUser: any;
  let dto: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivityCommand,
        {
          provide: MemberActivityReportService,
          useValue: {
            buildReport: jest.fn().mockResolvedValue(['the summary', 'the games']),
          },
        },
      ],
    }).compile();

    command = moduleRef.get<ActivityCommand>(ActivityCommand);
    reportService = moduleRef.get<MemberActivityReportService>(MemberActivityReportService);

    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockInteraction = TestBootstrapper.getMockDiscordInteraction('123456789', mockDiscordUser);
    mockInteraction[0].deferred = true;
    mockInteraction[0].followUp = jest.fn();
    mockInteraction[0].channel.isSendable = jest.fn().mockReturnValue(true);
    dto = { member: mockDiscordUser.user };
  });

  it('replies with the summary and sends the games after it', async () => {
    const result = await command.onActivityCommand(dto, mockInteraction);

    expect(mockInteraction[0].editReply).toHaveBeenCalledWith('the summary');
    expect(mockInteraction[0].followUp).toHaveBeenCalledWith(expect.objectContaining({ content: 'the games' }));
    expect(result).toBe('the summary');
  });

  it('sends every message the report produced', async () => {
    (reportService.buildReport as jest.Mock).mockResolvedValue(['one', 'two', 'three']);

    await command.onActivityCommand(dto, mockInteraction);

    expect(mockInteraction[0].followUp).toHaveBeenNthCalledWith(1, expect.objectContaining({ content: 'two' }));
    expect(mockInteraction[0].followUp).toHaveBeenNthCalledWith(2, expect.objectContaining({ content: 'three' }));
  });

  describe('visibility', () => {
    // A follow-up does not inherit the reply's privacy, so both have to carry the flag
    it('keeps the whole report private when show-in-channel is not set', async () => {
      await command.onActivityCommand(dto, mockInteraction);

      expect(mockInteraction[0].deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
      expect(mockInteraction[0].followUp).toHaveBeenCalledWith({
        content: 'the games',
        flags: MessageFlags.Ephemeral,
      });
    });

    // Standalone, so the games don't hang off the reply as a chained message
    it('sends the games as their own message when show-in-channel is true', async () => {
      await command.onActivityCommand({ ...dto, showInChannel: true }, mockInteraction);

      expect(mockInteraction[0].deferReply).toHaveBeenCalledWith({});
      expect(mockInteraction[0].channel.send).toHaveBeenCalledWith('the games');
      expect(mockInteraction[0].followUp).not.toHaveBeenCalled();
    });

    // Only a follow-up can stay private, so a private report cannot use a plain send
    it('falls back to a follow-up when the channel cannot be sent to', async () => {
      mockInteraction[0].channel.isSendable.mockReturnValue(false);

      await command.onActivityCommand({ ...dto, showInChannel: true }, mockInteraction);

      expect(mockInteraction[0].channel.send).not.toHaveBeenCalled();
      expect(mockInteraction[0].followUp).toHaveBeenCalledWith({ content: 'the games' });
    });

    it('stays private when the option is explicitly false', async () => {
      await command.onActivityCommand({ ...dto, showInChannel: false }, mockInteraction);

      expect(mockInteraction[0].deferReply).toHaveBeenCalledWith({ flags: MessageFlags.Ephemeral });
    });
  });

  it('passes the resolved guild member to the report', async () => {
    const member = { displayName: 'Mock Member' };
    mockInteraction[0].guild.members.fetch = jest.fn().mockResolvedValue(member);

    await command.onActivityCommand(dto, mockInteraction);

    expect(reportService.buildReport).toHaveBeenCalledWith(dto.member, member);
  });

  it('still reports on a member who has left the server', async () => {
    mockInteraction[0].guild.members.fetch = jest.fn().mockRejectedValue(new Error('Unknown Member'));

    await command.onActivityCommand(dto, mockInteraction);

    expect(reportService.buildReport).toHaveBeenCalledWith(dto.member, null);
  });

  it('surfaces a report failure instead of leaving the interaction hanging', async () => {
    (reportService.buildReport as jest.Mock).mockRejectedValue(new Error('database is on fire'));

    const result = await command.onActivityCommand(dto, mockInteraction);

    expect(result).toContain('⛔️ **ERROR:**');
    expect(result).toContain('database is on fire');
  });
});
