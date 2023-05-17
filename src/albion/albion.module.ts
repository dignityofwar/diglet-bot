import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { AlbionRegisterCommand } from './commands/register.command';
import { AlbionApiService } from './services/albion.api.service';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '../config/config.module';

@Module({
  imports: [DiscordModule.forFeature(), DatabaseModule, ConfigModule],
  providers: [AlbionApiService, AlbionRegisterCommand],
})
export class AlbionModule {}
