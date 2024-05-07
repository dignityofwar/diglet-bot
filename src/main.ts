import { NestFactory } from '@nestjs/core';
import { LogLevel } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const logLevels: LogLevel[] = determineLogLevels(process.env.LOG_LEVEL);
  await NestFactory.createApplicationContext(AppModule, {
    logger: logLevels,
  });
}

function determineLogLevels(envLogLevel: string | undefined): LogLevel[] {
  switch (envLogLevel) {
    case 'verbose':
      return ['log', 'error', 'warn', 'debug', 'verbose'];
    case 'debug':
      return ['log', 'error', 'warn', 'debug'];
    case 'info':
      return ['log', 'error', 'warn'];
    case 'warn':
      return ['warn', 'error'];
    case 'error':
      return ['error'];
    default:
      // Default log level if LOG_LEVEL is not set or is set incorrectly
      return ['error', 'warn'];
  }
}

bootstrap().then(() => {
  console.log(`Bot booted! Version: ${process.env.VERSION}`);
});
