import { BaseEntity } from "./base.entity";
import { Entity, Index, Property, Unique } from "@mikro-orm/core";

interface JoinerLeaverEntityOptions {
  discordId: string;
  discordNickname?: string;
  joinDate?: Date;
  leaveDate?: Date;
  rejoinCount?: number;
}

@Entity()
export class JoinerLeaverEntity extends BaseEntity {
  @Property()
  @Unique()
  @Index()
  discordId: string;

  @Property()
  discordNickname: string;

  @Property()
  joinDate: Date = new Date();

  @Property()
  leaveDate: Date | null = null;

  @Property()
  rejoinCount: number = 0;

  constructor(options: JoinerLeaverEntityOptions) {
    super();
    Object.assign(this, options);
  }
}
