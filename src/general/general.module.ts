import { Module } from '@nestjs/common';

import { PingCommand } from './commands/ping.command';
import { ConfigModule } from '../config/config.module';
import { PurgeService } from './services/purge.service';
import { DiscordService } from '../discord/discord.service';
import { MessageEvents } from './events/message.events';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/services/database.service';
import { VoiceStateEvents } from './events/voice.state.events';
import { ActivityService } from './services/activity.service';
import { GuildMemberEvents } from './events/guild.member.events';
import { InteractionEvents } from './events/interaction.events';
import { PurgeCronService } from './services/purge.cron.service';
import { ActivityReportCronService } from './services/activity.report.cron.service';
import { ActivityReportCommand } from './commands/activity.report.command';
import { JoinerLeaverService } from './services/joinerleaver.service';
import { RoleMetricsService } from './services/role.metrics.service';
import { RecRolePingService } from './services/rec.role.ping.service';
import { HealthcheckService } from './services/healthcheck.service';

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
    PurgeService,
    RecRolePingService,
    RoleMetricsService,

    // Commands
    ActivityReportCommand,
    PingCommand,

    // Events
    MessageEvents,
    VoiceStateEvents,
    GuildMemberEvents,
    InteractionEvents,

    // Cron Services
    PurgeCronService,
    ActivityReportCronService,
  ],
})
export class GeneralModule {}
