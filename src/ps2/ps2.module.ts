import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '../config/config.module';
import CensusAxiosFactory from './factories/census.axios.factory';
import { CensusApiService } from './service/census.api.service';
import { PS2VerifyCommand } from './commands/verify.command';
import { PS2GameVerificationService } from './service/ps2.game.verification.service';
import { CensusWebsocketService } from './service/census.websocket.service';
import { EventBusService } from './service/event.bus.service';

@Module({
  imports: [DiscordModule.forFeature(), DatabaseModule, ConfigModule],
  providers: [CensusAxiosFactory, CensusApiService, CensusWebsocketService, PS2VerifyCommand, PS2GameVerificationService, EventBusService],
})
export class Ps2Module {}
