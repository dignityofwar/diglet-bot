import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { AlbionRegisterCommand } from './commands/register.command';
import { AlbionApiService } from './services/albion.api.service';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '../config/config.module';
import { AlbionScanCommand } from './commands/scan.command';
import { AlbionScanningService } from './services/albion.scanning.service';

@Module({
  imports: [DiscordModule.forFeature(), DatabaseModule, ConfigModule],
  providers: [AlbionApiService, AlbionRegisterCommand, AlbionScanCommand, AlbionScanningService],
})
export class AlbionModule {}
