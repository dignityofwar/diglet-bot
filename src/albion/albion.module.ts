import { DiscordModule as DiscordJSModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { AlbionRegisterCommand } from './commands/register.command';
import { AlbionApiService } from './services/albion.api.service';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '../config/config.module';
import { AlbionRegistrationService } from './services/albion.registration.service';
import { DiscordModule } from '../discord/discord.module';
import { AlbionScanningService } from './services/albion.scanning.service';
import { AlbionScanCommand } from './commands/scan.command';
import { AlbionCronService } from './services/albion.cron.service';

@Module({
  imports: [DiscordJSModule.forFeature(), DiscordModule, DatabaseModule, ConfigModule],
  providers: [
    AlbionApiService,
    AlbionCronService,
    AlbionRegisterCommand,
    AlbionRegistrationService,
    AlbionScanCommand,
    AlbionScanningService,
  ],
})
export class AlbionModule {}
