import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  await NestFactory.createApplicationContext(AppModule);
}

bootstrap().then(() => {
  console.log(`Bot booted! Version: ${process.env.VERSION}`);
});
