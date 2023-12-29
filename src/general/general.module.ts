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

@Module({
  imports: [DiscordModule.forFeature(), ConfigModule, DatabaseModule],
  providers: [
    DatabaseService,
    DiscordService,
    PingCommand,
    PurgeCandidatesCommand,
    PurgeService,
    ThanosSnapCommand,
    MessageEvents,
  ],
})
export class GeneralModule {}
