import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { Events, GuildMember } from 'discord.js';
import { JoinerLeaverEntity } from '../../database/entities/joiner.leaver.entity';
import { On } from '@discord-nestjs/core';

@Injectable()
export class JoinerLeaverService {
  private readonly logger = new Logger(JoinerLeaverService.name);

  constructor(
    @InjectRepository(JoinerLeaverEntity) private readonly joinerLeaverRepository: EntityRepository<JoinerLeaverEntity>,
  ) {}

  @On(Events.GuildMemberAdd)
  async recordJoiner(guildMember: GuildMember) {
    if (guildMember.user.bot) {
      return;
    }

    let record = new JoinerLeaverEntity({
      discordId: guildMember.id,
      discordNickname: guildMember.displayName,
    });

    // Check if the user is already in the database
    const existingRecord = await this.joinerLeaverRepository.findOne({ discordId: guildMember.id });

    // If they previously joined, mark them as a re-joiner, and wipe their leave date.
    if (existingRecord) {
      record = existingRecord;
      this.logger.log(`User ${guildMember.user.tag} is already in the database, marking as rejoiner.`);
      record.rejoinCount += 1;
      record.leaveDate = null;
    }

    record.joinDate = new Date();

    // Save the record
    await this.joinerLeaverRepository.getEntityManager().persistAndFlush(record);

    this.logger.log(`Recorded joiner ${guildMember.user.tag} (${guildMember.id})`);
  }

  @On(Events.GuildMemberRemove)
  async recordLeaver(guildMember: GuildMember) {
    if (guildMember.user.bot) {
      return;
    }

    const record = await this.joinerLeaverRepository.findOne({ discordId: guildMember.id });

    if (record) {
      record.leaveDate = new Date();
      await this.joinerLeaverRepository.getEntityManager().persistAndFlush(record);
      this.logger.log(`Recorded leaver ${guildMember.user.tag} (${guildMember.id})`);
    }
    else {
      this.logger.error(`Attempted to record leaver ${guildMember.user.tag} (${guildMember.id}) but they were not found in the database.`);
    }
  }
}