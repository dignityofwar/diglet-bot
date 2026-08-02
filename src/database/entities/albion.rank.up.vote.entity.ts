import { Entity, Enum, Index, Property, Unique } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from './base.entity';

export enum AlbionRankUpVoteStatus {
  PENDING = 'pending',
  PASSED = 'passed',
  VETOED = 'vetoed',
  FAILED = 'failed',
  TIMED_OUT = 'timedOut',
  ABANDONED = 'abandoned', // The ballot message vanished; not an electoral result
}

export interface AlbionRankUpVoteEntityInterface {
  channelId: string;
  discordId: string;
  characterName: string;
  fromRank: string;
  toRank: string;
  requiredScore: number;
  electorateSize: number;
  expiresAt: Date;
  messageId?: string | null;
  pendingKey?: string | null;
  status?: AlbionRankUpVoteStatus;
  score?: number;
}

@Entity()
export class AlbionRankUpVoteEntity extends BaseEntity {
  @Property({ nullable: true, default: null })
  @Unique()
  @Index()
  messageId: null | string = null;

  @Property({ nullable: false })
  channelId: string;

  @Property({ nullable: false })
  @Index()
  discordId: string;

  // Holds discordId while pending, null once resolved. Unique indexes ignore nulls in MariaDB,
  // so this lets the database enforce one open ballot per member instead of a read-before-write.
  @Property({ nullable: true, default: null })
  @Unique()
  pendingKey: null | string = null;

  @Property({ nullable: false })
  characterName: string;

  @Property({ nullable: false })
  fromRank: string;

  @Property({ nullable: false })
  toRank: string;

  // Frozen at post time so the bar cannot move under a candidate mid-vote
  @Property({ nullable: false, type: 'double' })
  requiredScore: number;

  @Property({ nullable: false })
  electorateSize: number;

  @Enum(() => AlbionRankUpVoteStatus)
  @Property({ nullable: false, default: AlbionRankUpVoteStatus.PENDING })
  @Index()
  status: AlbionRankUpVoteStatus = AlbionRankUpVoteStatus.PENDING;

  @Property({ nullable: false })
  @Index()
  expiresAt: Date;

  @Property({ nullable: false, type: 'double', default: 0 })
  score = 0;

  // A resolving score is held here for a cooling off period before it is committed, so someone
  // changing their mind seconds later flips the result rather than arriving too late.
  @Enum({ items: () => AlbionRankUpVoteStatus, nullable: true })
  @Property({ nullable: true, default: null })
  provisionalStatus: null | AlbionRankUpVoteStatus = null;

  @Property({ nullable: true, default: null })
  @Index()
  provisionalSince: null | Date = null;

  @Property({ nullable: true, default: null, length: 512 })
  provisionalNote: null | string = null;

  @Property({ nullable: true, default: null })
  resolvedAt: null | Date = null;

  // Separate from resolvedAt so a crash between resolving and posting is recoverable
  @Property({ nullable: true, default: null })
  announcedAt: null | Date = null;

  @Property({ nullable: true, default: null, length: 512 })
  resolutionNote: null | string = null;

  constructor(options: AlbionRankUpVoteEntityInterface) {
    super();
    Object.assign(this, options);
  }
}
