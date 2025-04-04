/* eslint-disable @typescript-eslint/no-explicit-any */
import { Test } from '@nestjs/testing';
import { TestBootstrapper } from '../../test.bootstrapper';
import { ActivityReportCommand } from './activity.report.command';
import { ActivityService } from '../services/activity.service';

describe('ActivityReportCommand', () => {
  let command: ActivityReportCommand;
  let service: ActivityService;
  let mockInteraction: any;
  let mockDiscordUser: any;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      providers: [
        ActivityReportCommand,
        {
          provide: ActivityService,
          useValue: {
            startEnumeration: jest.fn(),
          },
        },
      ],
    }).compile();

    command = moduleRef.get<ActivityReportCommand>(ActivityReportCommand);
    service = moduleRef.get<ActivityService>(ActivityService);
    // Mock a ChatInputCommandInteraction
    mockDiscordUser = TestBootstrapper.getMockDiscordUser();
    mockInteraction = TestBootstrapper.getMockDiscordInteraction('123456789', mockDiscordUser);
  });

  it('should initiate the report', async () => {
    await command.onActivityEnumerateCommand(mockInteraction);

    expect(mockInteraction[0].channel.send).toHaveBeenCalledWith('Starting Activity Enumeration report via command...');
    expect(service.startEnumeration).toHaveBeenCalled();
  });
});
