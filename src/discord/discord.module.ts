import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';
import { DiscordService } from './discord.service';
import { DiscordModule as DiscordJSModule } from '@discord-nestjs/core/dist/discord.module';

@Module({
  imports: [ConfigModule, DiscordJSModule.forFeature()],
  providers: [DiscordService],
  exports: [DiscordService],
})
export class DiscordModule {}
