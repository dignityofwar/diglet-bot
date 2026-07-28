import { ConfigService } from '@nestjs/config';
import { ConfigModule } from './config/config.module';
import { Module } from '@nestjs/common';
import { GatewayIntentBits, Partials } from 'discord.js';
import { NecordModule } from 'necord';
import { GeneralModule } from './general/general.module';
import { AlbionModule } from './albion/albion.module';
import { DatabaseModule } from './database/database.module';
import { Ps2Module } from './ps2/ps2.module';
import { ScheduleModule } from '@nestjs/schedule';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    NecordModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        token: configService.get('TOKEN'),
        intents: [
          GatewayIntentBits.Guilds,
          GatewayIntentBits.GuildMembers,
          GatewayIntentBits.GuildMessages,
          GatewayIntentBits.GuildMessageReactions,
          GatewayIntentBits.GuildPresences,
          GatewayIntentBits.GuildVoiceStates,
        ],
        partials: [Partials.Message, Partials.Channel, Partials.Reaction],
        // Scopes every command to the DIG guild. necord bulk-overwrites that guild's command set
        // on startup, which is what prunes stale commands now `removeCommandsBefore` is gone.
        development: [configService.get('discord.guildId')],
      }),
      inject: [ConfigService],
    }),
    GeneralModule,
    AlbionModule,
    Ps2Module,
    ScheduleModule.forRoot(),
  ],
})
export class AppModule {}
