import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { PingCommand } from './commands/ping.command';
import { ConfigModule } from '../config/config.module';
import { PurgeCandidatesCommand } from './commands/purge.candidates.command';
import { PurgeService } from './services/purge.service';
import { ThanosSnapCommand } from './commands/thanos.snap.command';
import { DiscordService } from '../discord/discord.service';
import { MessageEvents } from './events/message.events';
import { DatabaseModule } from '../database/database.module';
import { DatabaseService } from '../database/services/database.service';
import { VoiceStateEvents } from './events/voice.state.events';

@Module({
  imports: [DiscordModule.forFeature(), ConfigModule, DatabaseModule],
  providers: [
    // Services
    DatabaseService,
    DiscordService,
    PurgeService,

    // Commands
    PingCommand,
    PurgeCandidatesCommand,
    ThanosSnapCommand,

    // Events
    MessageEvents,
    VoiceStateEvents,
  ],
})
export class GeneralModule {}
