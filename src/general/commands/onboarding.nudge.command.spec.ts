import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Logger } from '@nestjs/common';
import { SlashCommandContext } from 'necord';
import { OnboardingNudgeCommand } from './onboarding.nudge.command';
import { OnboardingNudgeCronService } from '../services/onboarding.nudge.cron.service';
import { OnboardingNudgeDto } from '../dto/onboarding.nudge.dto';

const botJobsId = 'channel-bot-jobs';

// necord hands omitted boolean options over as null, which the DTO's type doesn't admit
const dto = (dryRun: boolean | null, all: boolean | null = null): OnboardingNudgeDto => ({ dryRun, all }) as OnboardingNudgeDto;

interface MockInteraction {
  channelId: string;
  deferred: boolean;
  replied: boolean;
  deferReply: jest.Mock;
  reply: jest.Mock;
  editReply: jest.Mock;
  followUp: jest.Mock;
}

describe('OnboardingNudgeCommand', () => {
  let command: OnboardingNudgeCommand;
  let service: OnboardingNudgeCronService;
  let interaction: MockInteraction;

  const context = (): SlashCommandContext => [interaction] as unknown as SlashCommandContext;

  beforeEach(async () => {
    interaction = {
      channelId: botJobsId,
      deferred: false,
      replied: false,
      deferReply: jest.fn().mockImplementation(() => {
        interaction.deferred = true;
      }),
      reply: jest.fn(),
      editReply: jest.fn(),
      followUp: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OnboardingNudgeCommand,
        {
          provide: OnboardingNudgeCronService,
          useValue: { run: jest.fn().mockResolvedValue(['Summary']) },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue(botJobsId) },
        },
        Logger,
      ],
    }).compile();

    command = module.get<OnboardingNudgeCommand>(OnboardingNudgeCommand);
    service = module.get<OnboardingNudgeCronService>(OnboardingNudgeCronService);
  });

  it('defaults to a dry run when the option is omitted', async () => {
    expect(await command.onOnboardingNudgeCommand(dto(null), context())).toBe('Summary');

    expect(service.run).toHaveBeenCalledWith(true, false);
    expect(interaction.editReply).toHaveBeenCalledWith('Summary');
  });

  it('posts the rest of a paginated roster as follow-ups, with mentions off', async () => {
    (service.run as jest.Mock).mockResolvedValue(['Summary', 'Page two', 'Page three']);

    await command.onOnboardingNudgeCommand(dto(true), context());

    expect(interaction.editReply).toHaveBeenCalledWith('Summary');
    expect(interaction.followUp).toHaveBeenCalledTimes(2);
    expect(interaction.followUp).toHaveBeenNthCalledWith(1, { content: 'Page two', allowedMentions: { users: [] } });
    expect(interaction.followUp).toHaveBeenNthCalledWith(2, { content: 'Page three', allowedMentions: { users: [] } });
  });

  it('sends no follow-ups when the report is a single message', async () => {
    await command.onOnboardingNudgeCommand(dto(true), context());

    expect(interaction.followUp).not.toHaveBeenCalled();
  });

  it('runs live when dry-run is explicitly false', async () => {
    await command.onOnboardingNudgeCommand(dto(false), context());

    expect(service.run).toHaveBeenCalledWith(false, false);
  });

  it('passes the all flag through so a backlog can be cleared in one go', async () => {
    await command.onOnboardingNudgeCommand(dto(false, true), context());

    expect(service.run).toHaveBeenCalledWith(false, true);
  });

  it('refuses to run outside the bot jobs channel', async () => {
    interaction.channelId = 'somewhere-else';

    const reply = await command.onOnboardingNudgeCommand(dto(false), context());

    expect(reply).toContain(`<#${botJobsId}>`);
    expect(service.run).not.toHaveBeenCalled();
  });

  it('reports an error back rather than throwing', async () => {
    (service.run as jest.Mock).mockRejectedValue(new Error('not configured'));

    const reply = await command.onOnboardingNudgeCommand(dto(true), context());

    expect(reply).toContain('⛔️ **ERROR:**');
    expect(reply).toContain('not configured');
  });
});
