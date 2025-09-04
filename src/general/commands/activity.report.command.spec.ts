/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { TestBootstrapper } from '../../test.bootstrapper';
import { ActivityReportCommand } from './activity.report.command';
import { ActivityReportCronService } from '../services/activity.report.cron.service';

describe('ActivityReportCommand', () => {
  let command: ActivityReportCommand;
  let activityReportCronService: ActivityReportCronService;
  let mockInteraction: any;
  let mockDiscordUser: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivityReportCommand,
        {
          provide: ActivityReportCronService,
          useValue: {
            runReport: jest.fn(),
          },
        },
      ],
    }).compile();

    command = moduleRef.get<ActivityReportCommand>(ActivityReportCommand);
    activityReportCronService = moduleRef.get<ActivityReportCronService>(ActivityReportCronService);
    // Mock a ChatInputCommandInteraction
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockInteraction = TestBootstrapper.getMockDiscordInteraction('123456789', mockDiscordUser);
  });

  it('should initiate the report', async () => {
    await command.onActivityReportCommand(mockInteraction);

    expect(mockInteraction[0].reply).toHaveBeenCalledWith('Starting Activity Report via command...');
    expect(activityReportCronService.runReport).toHaveBeenCalled();
  });
});
