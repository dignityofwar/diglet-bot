import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayIntentBits } from 'discord.js';
import { GeneralModule } from './general/general.module';
import { AlbionModule } from './albion/albion.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    DiscordModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get('TOKEN'),
        discordClientOptions: {
          intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.GuildPresences],
        },
        registerCommandOptions: [
          {
            forGuild: configService.get('GUILD_ID_WITH_COMMANDS'),
            removeCommandsBefore: true,
          },
        ],
      }),
      inject: [ConfigService],
    }),
    GeneralModule,
    AlbionModule,
  ],
})
export class AppModule {}
