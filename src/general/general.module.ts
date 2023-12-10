import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { PingCommand } from './commands/ping.command';
import { ConfigModule } from '../config/config.module';
import { PurgeCandidatesCommand } from './commands/purge.candidates.command';
import { PurgeService } from './services/purge.service';

@Module({
  imports: [DiscordModule.forFeature(), ConfigModule],
  providers: [PingCommand, PurgeCandidatesCommand, PurgeService],
})
export class GeneralModule {}
