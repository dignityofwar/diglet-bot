import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { PingCommand } from './commands/ping.command';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [DiscordModule.forFeature(), ConfigModule],
  providers: [PingCommand],
})
export class GeneralModule {}
