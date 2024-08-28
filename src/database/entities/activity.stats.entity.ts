import { BaseEntity } from './base.entity';
import { Entity, Property } from '@mikro-orm/core';

interface ActivityStatsBucket {
  total: number;
  ps2Verified: number;
  albionRegistered: number;
}

interface ActivityStatsEntityOptions {
  activeUsers1d: ActivityStatsBucket;
  activeUsers2d: ActivityStatsBucket;
  activeUsers7d: ActivityStatsBucket;
  activeUsers14d: ActivityStatsBucket;
  activeUsers30d: ActivityStatsBucket;
  activeUsers60d: ActivityStatsBucket;
  activeUsers90d: ActivityStatsBucket;
}

@Entity()
export class ActivityStatsEntity extends BaseEntity {
  @Property({ type: 'json' })
    activeUsers1d: ActivityStatsBucket;

  @Property({ type: 'json' })
    activeUsers2d: ActivityStatsBucket;

  @Property({ type: 'json' })
    activeUsers7d: ActivityStatsBucket;

  @Property({ type: 'json' })
    activeUsers14d: ActivityStatsBucket;

  @Property({ type: 'json' })
    activeUsers30d: ActivityStatsBucket;

  @Property({ type: 'json' })
    activeUsers60d: ActivityStatsBucket;

  @Property({ type: 'json' })
    activeUsers90d: ActivityStatsBucket;

  constructor(options: ActivityStatsEntityOptions) {
    super();
    Object.assign(this, options);
  }
}
