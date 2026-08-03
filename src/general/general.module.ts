import { Module } from '@nestjs/common';

import { PingCommand } from './commands/ping.command';
import { HelloThereCommand } from './commands/hello.there.command';
import { ConfigModule } from '../config/config.module';
import { DiscordService } from '../discord/discord.service';
import { MessageEvents } from './events/message.events';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/services/database.service';
import { VoiceStateEvents } from './events/voice.state.events';
import { ActivityService } from './services/activity.service';
import { GuildMemberEvents } from './events/guild.member.events';
import { InteractionEvents } from './events/interaction.events';
import { ActivityReportCronService } from './services/activity.report.cron.service';
import { ActivityReportCommand } from './commands/activity.report.command';
import { JoinerLeaverService } from './services/joinerleaver.service';
import { RoleMetricsService } from './services/role.metrics.service';
import { RecRolePingService } from './services/rec.role.ping.service';
import { HealthcheckService } from './services/healthcheck.service';
import { MemberActivityRollupService } from './services/member.activity.rollup.service';
import { MemberActivityReportService } from './services/member.activity.report.service';
import { MemberPresenceCronService } from './services/member.presence.cron.service';
import { ActivityCommand } from './commands/activity.command';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
  ],
  providers: [
    // Services
    ActivityService,
    DatabaseService,
    DiscordService,
    HealthcheckService,
    JoinerLeaverService,
    MemberActivityReportService,
    MemberActivityRollupService,
    RecRolePingService,
    RoleMetricsService,

    // Commands
    ActivityCommand,
    ActivityReportCommand,
    HelloThereCommand,
    PingCommand,

    // Events
    MessageEvents,
    VoiceStateEvents,
    GuildMemberEvents,
    InteractionEvents,

    // Cron Services
    ActivityReportCronService,
    MemberPresenceCronService,
  ],
  exports: [MemberActivityRollupService],
})
export class GeneralModule {}
