import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { PingCommand } from './commands/ping.command';

@Module({
  imports: [DiscordModule.forFeature()],
  providers: [PingCommand],
})
export class GeneralModule {}
