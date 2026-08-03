/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
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
    dto = { member: mockDiscordUser.user };
  });

  it('replies publicly with the summary and follows up with the games', async () => {
    const result = await command.onActivityCommand(dto, mockInteraction);

    expect(mockInteraction[0].deferReply).toHaveBeenCalledWith();
    expect(mockInteraction[0].editReply).toHaveBeenCalledWith('the summary');
    expect(mockInteraction[0].followUp).toHaveBeenCalledWith('the games');
    expect(result).toBe('the summary');
  });

  it('sends every message the report produced', async () => {
    (reportService.buildReport as jest.Mock).mockResolvedValue(['one', 'two', 'three']);

    await command.onActivityCommand(dto, mockInteraction);

    expect(mockInteraction[0].followUp).toHaveBeenNthCalledWith(1, 'two');
    expect(mockInteraction[0].followUp).toHaveBeenNthCalledWith(2, 'three');
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
