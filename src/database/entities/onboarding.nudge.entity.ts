import { BaseEntity } from './base.entity';
import { Entity, Index, Property, Unique } from '@mikro-orm/decorators/legacy';

interface OnboardingNudgeEntityOptions {
  discordId: string;
  discordNickname?: string;
  nudgedAt?: Date;
}

// One row per member, ever. The unique key is what stops a second nudge rather than a
// read-before-write check, which would race with a manual run of the same job.
@Entity()
export class OnboardingNudgeEntity extends BaseEntity {
  @Property()
  @Unique()
  @Index()
  discordId: string;

  @Property()
  discordNickname: string;

  @Property()
  nudgedAt: Date = new Date();

  constructor(options: OnboardingNudgeEntityOptions) {
    super();
    Object.assign(this, options);
  }
}
