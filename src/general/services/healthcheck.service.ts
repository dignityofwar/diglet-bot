import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import axios from 'axios';
import { ConfigService } from '@nestjs/config';
import { writeFile } from 'node:fs/promises';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';

// Touched every cron tick and read by the container HEALTHCHECK in the Dockerfile.
//
// Deliberately NOT /tmp. That directory is world-writable, so any other process
// in the container could pre-create this path, symlink it elsewhere, or forge a
// heartbeat — which for a file the deploy gate trusts is a genuine weakness
// (Sonar S5443, CodeQL). This directory is created in the Dockerfile and owned
// by the unprivileged `node` user the image runs as, so nothing else can write
// to it.
export const HEARTBEAT_DIR = '/var/run/digletbot';
export const HEARTBEAT_PATH = `${HEARTBEAT_DIR}/heartbeat`;

@Injectable()
export class HealthcheckService {
  private readonly logger = new Logger(HealthcheckService.name);

  constructor(
    private readonly config: ConfigService,
    // Any repository will do — this is only used to reach the connection.
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {}

  // Every 30s rather than every minute because this is what gates a deploy.
  // `@Cron('*/1 * * * *')` fires on the wall-clock minute, so a container that
  // booted at :01 could not go healthy until :00 — up to 60s of a deploy spent
  // waiting on nothing. Measured on two consecutive deploys of the same image:
  // 72s and 22s in `docker compose up -d --wait`, decided purely by where boot
  // landed in the minute. Halving the tick halves that, and proves exactly as
  // much: the scheduler is ticking and MariaDB answers.
  @Cron('*/30 * * * * *')
  async heartbeat(): Promise<void> {
    // Written in every environment on purpose.
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
    //
    // The heartbeat is only written if the database answers, so "healthy" means
    // the scheduler is ticking AND the bot can reach MariaDB — a bot that is
    // resident but cannot read or write anything is not healthy in any useful
    // sense. `select 1` is the cheapest possible proof of a live connection and
    // depends on no schema.
    try {
      await this.activityRepository.getEntityManager().getConnection().execute('select 1');

      try {
        await writeFile(HEARTBEAT_PATH, new Date().toISOString());
      }
      catch (err) {
        // Never throw: failing to write the heartbeat must not take out the
        // uptime ping in check().
        this.logger.error(`Could not write heartbeat file: ${err}`);
      }
    }
    catch (err) {
      // Deliberately leaves the heartbeat stale, so the container healthcheck
      // starts failing and `docker compose up --wait` will not accept a deploy
      // whose bot cannot reach its database.
      this.logger.error(`Database healthcheck failed, heartbeat not written: ${err}`);
    }
  }

  @Cron('*/1 * * * *')
  async check(): Promise<void> {
    // Still written first here, so an outage at hc-ping.com can never be what
    // marks this container unhealthy. The 30s tick above covers it in its own
    // right; this call keeps that ordering guarantee true within check() too.
    await this.heartbeat();

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
