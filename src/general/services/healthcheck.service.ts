import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import axios from "axios";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class HealthcheckService {
  private readonly logger = new Logger(HealthcheckService.name);

  constructor(private readonly config: ConfigService) {}

  @Cron("*/1 * * * *")
  async check(): Promise<void> {
    const env = this.config.get("app.environment");

    if (env !== "production") {
      this.logger.log("Skipping healthcheck in non-production environment.");
      return;
    }

    const healthcheckUUID = this.config.get("app.healthcheckUUID");

    if (!healthcheckUUID) {
      this.logger.error(
        "Healthcheck UUID is not set in the environment variables!",
      );
      return;
    }

    const client = axios.create({
      baseURL: "https://hc-ping.com/",
    });

    await client.get(healthcheckUUID);
  }
}
