import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import DatabaseConfig from './database.config';
import AppConfig from './app.config';

@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      envFilePath: `.env${
        process.env.NODE_ENV ? `.${process.env.NODE_ENV}` : ''
      }`,
      load: [
        () => ({ app: AppConfig() }),
        () => ({ database: DatabaseConfig() }),
      ],
    }),
  ],
})
export class ConfigModule {}
