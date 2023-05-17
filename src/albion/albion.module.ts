import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';

import { AlbionRegisterCommand } from './commands/register.command';
import { AlbionApiService } from './services/albion.api.service';
import { DatabaseModule } from '../database/database.module';

@Module({
  imports: [DiscordModule.forFeature(), DatabaseModule],
  providers: [AlbionApiService, AlbionRegisterCommand],
})
export class AlbionModule {}
