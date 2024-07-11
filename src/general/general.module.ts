import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { PingCommand } from './commands/ping.command';
import { ConfigModule } from '../config/config.module';
import { PurgeService } from './services/purge.service';
import { ThanosSnapCommand } from './commands/thanos.snap.command';
import { DiscordService } from '../discord/discord.service';
import { MessageEvents } from './events/message.events';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/services/database.service';
import { VoiceStateEvents } from './events/voice.state.events';
import { ActivityScanCommand } from './commands/activity.scan.command';
import { ActivityService } from './services/activity.service';
import { GuildMemberEvents } from './events/guild.member.events';
// import { ActivityCronService } from './services/activity.cron.service';
// import { PurgeCronService } from './services/purge.cron.service';

@Module({
  imports: [DiscordModule.forFeature(), ConfigModule, DatabaseModule],
  providers: [
    // Services
    ActivityService,
    DatabaseService,
    DiscordService,
    PurgeService,

    // Commands
    ActivityScanCommand,
    PingCommand,
    ThanosSnapCommand,

    // Events
    MessageEvents,
    VoiceStateEvents,
    GuildMemberEvents,

    // Cron Services
    // ActivityCronService,
    // PurgeCronService
  ],
})
export class GeneralModule {}
