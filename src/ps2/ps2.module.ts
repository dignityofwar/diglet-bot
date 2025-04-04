import { DiscordModule as DiscordJSModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '../config/config.module';
import CensusAxiosFactory from './factories/census.axios.factory';
import { CensusApiService } from './service/census.api.service';
import { PS2VerifyCommand } from './commands/verify.command';
import { PS2GameVerificationService } from './service/ps2.game.verification.service';
import { CensusWebsocketService } from './service/census.websocket.service';
import { PS2GameScanningService } from './service/ps2.game.scanning.service';
import { PS2ScanCommand } from './commands/scan.command';
import { PS2CronService } from './service/ps2.cron.service';
import { DiscordModule } from '../discord/discord.module';
import { PS2VerifyManualCommand } from './commands/verify.manual.command';

@Module({
  imports: [
    DiscordJSModule.forFeature(), // Needed for the command decorators to work
    DiscordModule,
    DatabaseModule,
    ConfigModule,
  ],
  providers: [
    CensusAxiosFactory,
    CensusApiService,
    CensusWebsocketService,
    PS2CronService,
    PS2GameVerificationService,
    PS2GameScanningService,
    PS2VerifyCommand,
    PS2VerifyManualCommand,
    PS2ScanCommand,
  ],
})
export class Ps2Module {}
