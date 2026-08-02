import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import {
  AlbionRankUpVoteEntity,
  AlbionRankUpVoteStatus,
} from '../../database/entities/albion.rank.up.vote.entity';
import { AlbionRankUpVoteService } from './albion.rank.up.vote.service';

@Injectable()
export class AlbionRankUpVoteCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AlbionRankUpVoteCronService.name);

  constructor(
    private readonly voteService: AlbionRankUpVoteService,
    @InjectRepository(AlbionRankUpVoteEntity) private readonly voteRepository: EntityRepository<AlbionRankUpVoteEntity>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    // A bot that was down over a deadline shouldn't leave ballots hanging until the next sweep
    try {
      await this.sweep();
    }
    catch (err) {
      this.logger.error(`Failed the boot rank up vote sweep: ${err.message}`);
    }
  }

  // Every minute, so a provisional result commits within a minute of its hold elapsing.
  // Two indexed queries and a usually-empty result set, so the cost is negligible.
  @Cron('* * * * *')
  async runSweep(): Promise<void> {
    try {
      await this.sweep();
    }
    catch (err) {
      this.logger.error(`Failed the rank up vote sweep: ${err.message}`);
    }
  }

  async sweep(): Promise<void> {
    // First, so a stranded claim is cleared before expireOverdue can time it out
    await this.voteService.reclaimUnposted();
    await this.reconcileUnannounced();
    // Re-tallies every open ballot, which also commits any hold whose window has passed. A cron
    // rather than an in-process timer, so a restart mid-hold doesn't strand the ballot.
    await this.voteService.resyncPending();
    await this.expireOverdue();
  }

  // The crash-in-between case: resolved in the database, never posted to Discord
  async reconcileUnannounced(): Promise<void> {
    const unannounced = await this.voteRepository.find({
      resolvedAt: { $ne: null },
      announcedAt: null,
    });

    for (const vote of unannounced) {
      this.logger.warn(`Finishing unannounced outcome for vote ${vote.id}`);
      await this.voteService.announce(vote);
    }
  }

  async expireOverdue(): Promise<void> {
    const overdue = await this.voteRepository.find({
      status: AlbionRankUpVoteStatus.PENDING,
      expiresAt: { $lte: new Date() },
    });

    for (const vote of overdue) {
      // Recount first. Reactions cast while the bot was down are invisible until something
      // recounts, so timing out blind can close a vote that actually passed or was vetoed.
      await this.voteService.evaluate(vote);

      const current = await this.voteRepository.findOne({ id: vote.id });

      if (current?.status !== AlbionRankUpVoteStatus.PENDING) {
        continue;
      }

      // The voting period is over, so there is nothing left to change its mind - commit a held
      // result now rather than discarding it and reporting a timeout instead.
      if (current.provisionalStatus) {
        await this.voteService.resolve(
          current,
          current.provisionalStatus,
          current.score,
          current.provisionalNote ?? undefined,
        );
        continue;
      }

      await this.voteService.resolve(
        current,
        AlbionRankUpVoteStatus.TIMED_OUT,
        current.score,
        'Voting period elapsed without reaching the required score',
      );
    }
  }
}
