import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { writeFile } from 'fs/promises';

// Touched every cron tick and read by the container HEALTHCHECK in the Dockerfile.
// /tmp because the image runs as the unprivileged `node` user.
export const HEARTBEAT_PATH = '/tmp/digletbot-heartbeat';

@Injectable()
export class HealthcheckService {
  private readonly logger = new Logger(HealthcheckService.name);

  constructor(
    private readonly config: ConfigService,
  ) {}

  @Cron('*/1 * * * *')
  async check(): Promise<void> {
    // Written FIRST, and in every environment, on purpose.
    //
    // This is the only liveness signal the container has: the bot is a
    // standalone Nest application context (`createApplicationContext`), so there
    // is no HTTP server to probe and no port to open. A process check would be
    // meaningless because the bot is PID 1 — if it dies the container dies and
    // Docker already knows. What this proves is that the scheduler is still
    // ticking, which a wedged or crash-looping bot cannot fake.
    //
    // It goes before the environment gate so a non-production container is
    // still probeable, and before the hc-ping call so an outage at hc-ping.com
    // cannot mark this container unhealthy.
    try {
      await writeFile(HEARTBEAT_PATH, new Date().toISOString());
    }
    catch (err) {
      // Never throw: failing to write the heartbeat must not take out the
      // uptime ping below.
      this.logger.error(`Could not write heartbeat file: ${err}`);
    }

    const env = this.config.get('app.environment');

    if (env !== 'production') {
      this.logger.log('Skipping healthcheck in non-production environment.');
      return;
    }

    const healthcheckUUID = this.config.get('app.healthcheckUUID');

    if (!healthcheckUUID) {
      this.logger.error('Healthcheck UUID is not set in the environment variables!');
      return;
    }

    const client = axios.create({
      baseURL: 'https://hc-ping.com/',
    });

    await client.get(healthcheckUUID);
  }
}
