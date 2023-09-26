import { DiscordModule as DiscordJSModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { AlbionRegisterCommand } from './commands/register.command';
import { AlbionApiService } from './services/albion.api.service';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '../config/config.module';
import { AlbionRegistrationService } from './services/albion.registration.service';
import { DiscordModule } from '../discord/discord.module';

@Module({
  imports: [DiscordJSModule.forFeature(), DiscordModule, DatabaseModule, ConfigModule],
  providers: [AlbionApiService, AlbionRegisterCommand, AlbionRegistrationService],
})
export class AlbionModule {}
