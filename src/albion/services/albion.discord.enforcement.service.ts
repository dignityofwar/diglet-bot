import { Injectable, Logger } from '@nestjs/common';
import { Message } from 'discord.js';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { AlbionGuildMembersEntity } from '../../database/entities/albion.guildmembers.entity';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { AlbionApiService } from './albion.api.service';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { getChannel } from '../../discord/discord.hacks';

@Injectable()
export class AlbionDiscordEnforcementService {
  private readonly logger = new Logger(AlbionDiscordEnforcementService.name);
  private readonly bootDays = 10;
  private actionRequired = false;

  constructor(
    private readonly albionApiService: AlbionApiService,
    private readonly config: ConfigService,
    @InjectRepository(AlbionRegistrationsEntity) private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
    @InjectRepository(AlbionGuildMembersEntity) private readonly albionGuildMembersRepository: EntityRepository<AlbionGuildMembersEntity>
  ) {
  }
  async startScan(message: Message, dryRun = false) {
    const statusMessage = await getChannel(message).send('## Starting Discord enforcement scan...');

    // First, get all the DIG guild members and parse them into an array
    const guildMembers = await this.albionApiService.getAllGuildMembers(this.config.get('albion.guildIdUS'), AlbionServer.AMERICAS);
    const guildMembersLength = guildMembers.length;

    const currentGuildMembers: AlbionGuildMembersEntity[] = await this.albionGuildMembersRepository.findAll();

    // Get the registered members from the database again as they may have changed
    const registeredMembers: AlbionRegistrationsEntity[] = await this.albionRegistrationsRepository.findAll();

    const unregisteredMembers: AlbionPlayerInterface[] = [];

    // Loop all guild members and check if they exist in the registeredMembers list, if they don't, add them to a unregistered list
    for (const guildMember of guildMembers) {
      const memberIsRegistered = registeredMembers.filter((registeredMember) => registeredMember.characterId === guildMember.Id)[0];

      if (!memberIsRegistered) {
        unregisteredMembers.push(guildMember);
      }

      // Check if they have a guild member record
      const foundGuildMember = currentGuildMembers.filter((currentGuildMember) => currentGuildMember.characterId === guildMember.Id)[0];

      // If not, add them to the guild members table
      if (!foundGuildMember && !dryRun) {
        await this.albionGuildMembersRepository.getEntityManager().persistAndFlush(new AlbionGuildMembersEntity({
          characterId: guildMember.Id,
          characterName: guildMember.Name,
          registered: !!memberIsRegistered,
          warned: false,
        }));
      }
    }

    await getChannel(message).send(`ℹ️ **${unregisteredMembers.length}** unregistered members out of total ${guildMembersLength} guild members.`);

    // 1. > 10 days boot warning
    // Find all guild members who are not registered and were first seen > 10 days ago
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - this.bootDays);

    const bootableMembers = await this.albionGuildMembersRepository.find({
      registered: false,
      createdAt: { $lte: tenDaysAgo },
    });

    if (!bootableMembers || bootableMembers.length === 0) {
      this.logger.debug('No bootable members found!');
    }
    else {
      // Loop the bootable members and spit put their names in Discord
      await getChannel(message).send(`## 🦵 ${bootableMembers.length} members have reached their ${this.bootDays} day kick limit!`);

      for (const bootableMember of bootableMembers) {
        await getChannel(message).send(`- ‼️ **${bootableMember.characterName}** needs the boot!`);
      }
    }

    // 2. 5 Day limit Warning
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - (this.bootDays - 5));

    const fiveDayWarningMembers = await this.albionGuildMembersRepository.find({
      registered: false,
      warned: false,
      createdAt: { $lte: fiveDaysAgo, $gte: tenDaysAgo },
    });
    const warnedMembers = await this.albionGuildMembersRepository.find({
      warned: true,
    });

    if (!fiveDayWarningMembers || fiveDayWarningMembers.length === 0) {
      this.logger.debug('No 5 day warning members found!');
    }
    else {
      await getChannel(message).send(`## 📧 ${fiveDayWarningMembers.length} members have reached their ${(this.bootDays - 5)} day warning limit!\nCheck Scriptorium for the template.`);

      for (const fiveDayWarningMember of fiveDayWarningMembers) {
        await getChannel(message).send(`- ‼️ **${fiveDayWarningMember.characterName}** needs a warning!`);

        // Mark them as warned
        if (!dryRun) {
          fiveDayWarningMember.warned = true;
          await this.albionGuildMembersRepository.getEntityManager().persistAndFlush(fiveDayWarningMember);
          this.logger.debug(`Marked ${fiveDayWarningMember.characterName} as warned!`);
        }
      }
    }

    // 3. Members who are running out of time...
    if (warnedMembers && warnedMembers.length > 0) {
      await getChannel(message).send(`### ⏰ Clock's ticking for ${warnedMembers.length} warned member(s)!`);

      for (const warnedMember of warnedMembers) {
        // Get their final kick date by taking their createdAt date and adding 10 days
        const finalKickDate = new Date(warnedMember.createdAt);
        finalKickDate.setDate(finalKickDate.getDate() + this.bootDays);

        // Get unix for DC time code
        const unix = Math.floor(finalKickDate.getTime() / 1000);

        await getChannel(message).send(`- **${warnedMember.characterName}** will be booted on: <t:${unix}:D> (<t:${unix}:R>)`);
      }
    }

    if (
      bootableMembers
      && warnedMembers
      && fiveDayWarningMembers
    ) {
      await getChannel(message).send('✅ No members require kicking, warning or are close to being booted.');
    }
    if (bootableMembers.length > 0 || fiveDayWarningMembers.length > 0) {
      this.actionRequired = true;
    }

    await statusMessage.delete();
  }
}
