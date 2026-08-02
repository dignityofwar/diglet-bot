import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { MemberDailyActivityEntity } from '../../database/entities/member.daily.activity.entity';
import {
  GAME_NAME_MAX_LENGTH,
  MemberDailyGameActivityEntity,
} from '../../database/entities/member.daily.game.activity.entity';
import { utcMidnight } from '../../helpers';

export type RollupCounter = 'messagesSent' | 'reactionsAdded' | 'voiceMinutes';

// Hardcoded so no caller-supplied value ever reaches the SQL string
const COUNTER_COLUMNS: Record<RollupCounter, string> = {
  messagesSent: 'messages_sent',
  reactionsAdded: 'reactions_added',
  voiceMinutes: 'voice_minutes',
};

export interface GameActivitySample {
  discordId: string;
  gameName: string;
}

export interface GameTotal {
  gameName: string;
  minutes: number;
}

@Injectable()
export class MemberActivityRollupService {
  private readonly logger = new Logger(MemberActivityRollupService.name);

  constructor(
    @InjectRepository(MemberDailyActivityEntity) private readonly activityRepository: EntityRepository<MemberDailyActivityEntity>,
    @InjectRepository(MemberDailyGameActivityEntity) private readonly gameRepository: EntityRepository<MemberDailyGameActivityEntity>,
  ) {}

  // One statement for the whole batch. A findOne/persist loop would both cost a round trip per
  // member per minute and lose counts when the cron and a message event race.
  async increment(
    discordIds: string[],
    counter: RollupCounter,
    amount = 1,
    date: Date = utcMidnight(),
  ): Promise<void> {
    const unique = [...new Set(discordIds)];

    if (unique.length === 0) {
      return;
    }

    const column = COUNTER_COLUMNS[counter];

    if (!column) {
      throw new Error(`Unknown activity counter "${counter}"`);
    }

    const values = unique.map(() => '(?, ?, ?, ?, ?)').join(', ');
    const now = new Date();
    const params = unique.flatMap((discordId) => [discordId, date, amount, now, now]);

    try {
      await this.activityRepository.getEntityManager().getConnection().execute(
        `insert into member_daily_activity_entity (discord_id, date, ${column}, created_at, updated_at)
         values ${values}
         on duplicate key update ${column} = ${column} + values(${column}), updated_at = values(updated_at)`,
        params,
      );
    }
    catch (err) {
      this.logger.error(`Failed to increment ${counter} for ${unique.length} member(s): ${err.message}`);
    }
  }

  async incrementGameMinutes(
    samples: GameActivitySample[],
    amount = 1,
    date: Date = utcMidnight(),
  ): Promise<void> {
    const seen = new Map<string, GameActivitySample>();

    for (const sample of samples) {
      const gameName = sample.gameName?.trim().slice(0, GAME_NAME_MAX_LENGTH);

      if (!gameName) {
        continue;
      }

      seen.set(`${sample.discordId}|${gameName}`, { discordId: sample.discordId, gameName });
    }

    if (seen.size === 0) {
      return;
    }

    const unique = [...seen.values()];
    const values = unique.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const now = new Date();
    const params = unique.flatMap(({ discordId, gameName }) => [discordId, date, gameName, amount, now, now]);

    try {
      await this.gameRepository.getEntityManager().getConnection().execute(
        `insert into member_daily_game_activity_entity (discord_id, date, game_name, minutes, created_at, updated_at)
         values ${values}
         on duplicate key update minutes = minutes + values(minutes), updated_at = values(updated_at)`,
        params,
      );
    }
    catch (err) {
      this.logger.error(`Failed to increment game minutes for ${unique.length} sample(s): ${err.message}`);
    }
  }

  async getRollup(discordId: string, since: Date): Promise<MemberDailyActivityEntity[]> {
    return await this.activityRepository.find({
      discordId,
      date: { $gte: utcMidnight(since) },
    });
  }

  async getGameTotals(discordId: string, since: Date): Promise<GameTotal[]> {
    const rows = await this.gameRepository.find({
      discordId,
      date: { $gte: utcMidnight(since) },
    });

    const totals = new Map<string, number>();

    for (const row of rows) {
      totals.set(row.gameName, (totals.get(row.gameName) ?? 0) + row.minutes);
    }

    return [...totals.entries()]
      .map(([gameName, minutes]) => ({ gameName, minutes }))
      .sort((a, b) => b.minutes - a.minutes);
  }

  // Powers the "tracking began" caveat, so a member predating the rollups isn't read as inactive.
  // findAll, not findOne({}) - MikroORM rejects an empty where outright rather than matching all.
  async getTrackingStartDate(): Promise<Date | null> {
    const [earliest] = await this.activityRepository.findAll({ orderBy: { date: 'ASC' }, limit: 1 });
    return earliest?.date ?? null;
  }
}
