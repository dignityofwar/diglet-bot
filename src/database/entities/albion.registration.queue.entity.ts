import { Entity, Enum, Index, Property, Unique } from '@mikro-orm/decorators/legacy';
import { BaseEntity } from './base.entity';

export enum AlbionRegistrationQueueStatus {
  PENDING = 'pending',
  SUCCEEDED = 'succeeded',
  FAILED = 'failed',
  EXPIRED = 'expired',
}

export interface AlbionRegistrationQueueEntityInterface {
  guildId: string
  discordGuildId: string
  discordChannelId: string
  discordId: string
  characterName: string
  attemptCount?: number
  expiresAt: Date
  status?: AlbionRegistrationQueueStatus
  lastError?: string | null
  forceQueued?: boolean
}

@Entity()
@Unique({
  name: 'unique_albion_registration_queue_guild_discord_status',
  properties: ['guildId', 'discordId', 'status'],
})
export class AlbionRegistrationQueueEntity extends BaseEntity {
  @Property({ nullable: false })
  @Index()
  guildId: string;

  @Property({ nullable: false })
  @Index()
  discordGuildId: string;

  @Property({ nullable: false })
  discordChannelId: string;

  @Property({ nullable: false })
  @Index()
  discordId: string;

  @Property({ nullable: false })
  characterName: string;

  @Enum(() => AlbionRegistrationQueueStatus)
  @Property({ nullable: false, default: AlbionRegistrationQueueStatus.PENDING })
  @Index()
  status: AlbionRegistrationQueueStatus = AlbionRegistrationQueueStatus.PENDING;

  @Property({ nullable: false, default: 0 })
  attemptCount = 0;

  @Property({ nullable: false })
  @Index()
  expiresAt: Date;

  @Property({ nullable: true, default: null, length: 2000 })
  lastError: null | string = null;

  // Staff forced this attempt in, so hard failures are retried instead of ending the attempt.
  @Property({ nullable: false, default: false })
  forceQueued = false;

  constructor(options: AlbionRegistrationQueueEntityInterface) {
    super();
    Object.assign(this, options);
  }
}
