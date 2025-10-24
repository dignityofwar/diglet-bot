import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import AlbionAppConfig from './albion.app.config';
import AppConfig from './app.config';
import DiscordConfig from './discord.config';
import Ps2Config from './ps2.app.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: 'digletbot.env',
      load: [
        () => ({ albion: AlbionAppConfig() }),
        () => ({ app: AppConfig() }),
        () => ({ discord: DiscordConfig() }),
        () => ({ ps2: Ps2Config() }),
      ],
    }),
  ],
})
export class ConfigModule {}
