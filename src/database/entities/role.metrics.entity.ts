import { BaseEntity } from "./base.entity";
import { Entity, Property } from "@mikro-orm/core";

interface GameMetrics {
  [gameId: string]: number;
}

interface RoleMetricsEntityOptions {
  createdAt?: Date;
  updatedAt?: Date;
  onboarded: number;
  communityGames: GameMetrics | null;
  recGames: GameMetrics | null;
}

@Entity()
export class RoleMetricsEntity extends BaseEntity {
  @Property()
  onboarded: number = 0;

  @Property({ type: "json", nullable: true })
  communityGames: GameMetrics = {};

  @Property({ type: "json", nullable: true })
  recGames: GameMetrics = {};

  constructor(options: RoleMetricsEntityOptions) {
    super();
    Object.assign(this, options);
  }
}
