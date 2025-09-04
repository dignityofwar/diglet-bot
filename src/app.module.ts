import { DiscordModule } from '@discord-nestjs/core';
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GatewayIntentBits, Partials } from 'discord.js';
import { GeneralModule } from './general/general.module';
import { AlbionModule } from './albion/albion.module';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { Ps2Module } from './ps2/ps2.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    DiscordModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get('TOKEN'),
        discordClientOptions: {
          intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.GuildVoiceStates,
          ],
          partials: [Partials.Message, Partials.Channel, Partials.Reaction],
        },
        registerCommandOptions: [
          {
            forGuild: configService.get('discord.guildId'),
            removeCommandsBefore: true,
          },
        ],
      }),
      inject: [ConfigService],
    }),
    GeneralModule,
    AlbionModule,
    Ps2Module,
    ScheduleModule.forRoot(),
    DiscordModule,
  ],
})
export class AppModule {}
