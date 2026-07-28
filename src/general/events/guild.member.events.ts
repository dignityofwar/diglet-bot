import { Injectable, Logger } from '@nestjs/common';
import { Context, ContextOf, On } from 'necord';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../database/entities/activity.entity';

@Injectable()
export class GuildMemberEvents {
  private readonly logger = new Logger(GuildMemberEvents.name);

  constructor(
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
  ) {}

  @On('guildMemberRemove')
  async onGuildMemberRemove(
    @Context() [member]: ContextOf<'guildMemberRemove'>,
  ): Promise<void> {
    if (member.user.bot) return;

    const activityRecord = await this.activityRepository.findOne({ discordId: member.id });

    // If they have an activity record (they won't if they immediately left the server), delete it.
    if (activityRecord) {
      this.logger.debug(`Member "${member.displayName}" has left the server.`);
      await this.activityRepository.getEntityManager().remove(activityRecord).flush();
      this.logger.log(`Removed activity record for leaver ${activityRecord.discordNickname} (${activityRecord.discordId})`);
    }
    else {
      this.logger.warn(`No activity record was found for leaver ${member.displayName} (${member.id}), likely left immediately after joining.`);
    }
  }
}
