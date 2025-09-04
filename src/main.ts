import { NestFactory } from "@nestjs/core";
import { LogLevel } from "@nestjs/common";
import { AppModule } from "./app.module";
import "./instrument.js";
import * as Sentry from "@sentry/node";

async function bootstrap() {
  const logLevels: LogLevel[] = determineLogLevels(process.env.LOG_LEVEL);
  await NestFactory.createApplicationContext(AppModule, {
    logger: logLevels,
  });

  // Set up global error handling
  process.on("uncaughtException", (err) => {
    Sentry.captureException(err);
    console.error("Uncaught Exception:", err);
  });

  process.on("unhandledRejection", (reason, promise) => {
    Sentry.captureException(reason);
    console.error("Unhandled Rejection at:", promise, "reason:", reason);
  });
}

function determineLogLevels(envLogLevel: string | undefined): LogLevel[] {
  switch (envLogLevel) {
    case "verbose":
      return ["log", "error", "warn", "debug", "verbose"];
    case "debug":
      return ["log", "error", "warn", "debug"];
    case "info":
      return ["log", "error", "warn"];
    case "warn":
      return ["warn", "error"];
    case "error":
      return ["error"];
    default:
      // Default log level if LOG_LEVEL is not set or is set incorrectly
      return ["error", "warn"];
  }
}

bootstrap().then(() => {
  console.log(`Bot booted! Version: ${process.env.VERSION}`);
});
