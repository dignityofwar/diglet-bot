import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { Events, GuildMember, Message } from 'discord.js';
import { JoinerLeaverEntity } from '../../database/entities/joiner.leaver.entity';
import { On } from '@discord-nestjs/core';
import { JoinerLeaverStatisticsEntity } from '../../database/entities/joiner.leaver.statistics.entity';
import { getChannel } from '../../discord/discord.hacks';

@Injectable()
export class JoinerLeaverService {
  private readonly logger = new Logger(JoinerLeaverService.name);

  constructor(
    @InjectRepository(JoinerLeaverEntity) private readonly joinerLeaverRepository: EntityRepository<JoinerLeaverEntity>,
    @InjectRepository(JoinerLeaverStatisticsEntity) private readonly joinerLeaverStatisticsRepository: EntityRepository<JoinerLeaverStatisticsEntity>,
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

  async startEnumeration(message: Message): Promise<void> {
    this.logger.log('Starting joiner leaver enumeration');

    try {
      await this.enumerateJoinerLeavers();
    }
    catch (err) {
      const error = `Error enumerating joiner leaver records. Error: ${err.message}`;
      this.logger.error(error);
      await getChannel(message).send(error);
      return;
    }
    const latestRecord = await this.joinerLeaverStatisticsRepository.find(
      {},
      {
        orderBy: { createdAt: 'desc' },
        limit: 1,
      }
    );

    if (!latestRecord[0]) {
      const error = 'No joiner leaver statistics found!';
      this.logger.error(error);
      await getChannel(message).send(error);
      return;
    }
    const stat = latestRecord[0];

    const report = `## Joiner & Leavers:
- 👋 Joiners: **${stat.joiners}**
- 🚪 Leavers: **${stat.leavers}**
- 👍 Rejoiners: **${stat.rejoiners}**
- 🥺 Early Leavers: (<48h): **${stat.earlyLeavers}**
- ⏳ Average Time to Leave: **${stat.avgTimeToLeave}**`;

    // Send a message to the channel with the report
    await getChannel(message).send(report);
    this.logger.log(report);
  }

  async enumerateJoinerLeavers(): Promise<void> {
    const earlyLeaverThreshold = 2; // 2 days
    const joinerLeaverRecords = await this.joinerLeaverRepository.findAll();

    const joiners = joinerLeaverRecords.length;
    const leavers = joinerLeaverRecords.filter(record => record.leaveDate !== null).length;
    const rejoiners = joinerLeaverRecords.filter(record => record.rejoinCount > 0).length;
    const earlyLeavers = joinerLeaverRecords.filter(record => {
      if (record.leaveDate && record.joinDate) {
        const diff = Math.abs(record.leaveDate.getTime() - record.joinDate.getTime());
        const diffDays = Math.ceil(diff / (1000 * 3600 * 24));
        return diffDays <= earlyLeaverThreshold;
      }
      return false;
    }).length;

    const avgTimeToLeave = this.calculateAvgTimeToLeave(joinerLeaverRecords);

    // Create a date and set it to be midnight of the day it was run
    const date = new Date();
    date.setHours(0, 0, 0, 0);

    // Check if there is already a report on the same date, if so, delete it
    const existingReport = await this.joinerLeaverStatisticsRepository.findOne({ createdAt: date });
    if (existingReport) {
      await this.joinerLeaverStatisticsRepository.getEntityManager().removeAndFlush(existingReport);
      this.logger.warn(`Removed existing report for date ${date}`);
    }

    const entity = new JoinerLeaverStatisticsEntity({
      createdAt: date,
      updatedAt: date,
      joiners,
      leavers,
      rejoiners,
      earlyLeavers,
      avgTimeToLeave,
    });
    await this.joinerLeaverStatisticsRepository.getEntityManager().persistAndFlush(entity);

    this.logger.log('Enumerated joiner leavers');
  }

  calculateAvgTimeToLeave(joinerLeaverRecords: JoinerLeaverEntity[]): string {
    const leavers = joinerLeaverRecords.filter(record => record.leaveDate !== null).length;

    const avgTimeToLeave = joinerLeaverRecords
      .filter(record => record.leaveDate && record.joinDate)
      .reduce((acc, record) => {
        const diff = Math.abs(record.leaveDate.getTime() - record.joinDate.getTime());
        return acc + diff;
      }, 0) / leavers;
    const avgTimeToLeaveDays = Math.floor(avgTimeToLeave / (1000 * 3600 * 24));
    const avgTimeToLeaveHours = Math.floor((avgTimeToLeave % (1000 * 3600 * 24)) / (1000 * 3600));
    const avgTimeToLeaveMinutes = Math.floor((avgTimeToLeave % (1000 * 3600)) / (1000 * 60));

    return `${avgTimeToLeaveDays}d ${avgTimeToLeaveHours}h ${avgTimeToLeaveMinutes}m`;
  }
}