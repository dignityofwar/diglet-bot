import { Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { AlbionRegistrationsEntity } from '../../database/entities/albion.registrations.entity';
import { EntityRepository } from '@mikro-orm/core';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { Message } from 'discord.js';
import { AlbionApiService } from './albion.api.service';
import { AlbionPlayerInterface, AlbionServer } from '../interfaces/albion.api.interfaces';
import { getChannel } from '../../discord/discord.hacks';

export class AlbionReportsService {
  private readonly logger = new Logger(AlbionReportsService.name);

  constructor(
    @InjectRepository(AlbionRegistrationsEntity) private readonly albionMembersRepository: EntityRepository<AlbionRegistrationsEntity>,
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    private readonly albionApiService: AlbionApiService,
    private readonly albionUtilities: AlbionUtilities
  ) {}

  async fullReport(message: Message) {
    this.logger.log('Full Report started');

    await message.edit('Getting Guild members from the API...');

    // Get total number of members with the Albion Online role
    let albionMembers: AlbionPlayerInterface[] = [];

    try {
      albionMembers = await this.albionApiService.getAllGuildMembers(this.config.get('albion.guildIdUS'), AlbionServer.AMERICAS);
    }
    catch (err) {
      this.logger.error(err);
      await message.edit(`Failed to load discord members. Pinging <@${this.config.get('discord.devUserId')}>!`);
      return;
    }

    await message.edit('Loading Registrations...');

    // Get all registered members from database
    const registered = await this.albionMembersRepository.findAll();

    // Report stuffs
    const metrics = {
      totalMembers: albionMembers.length,
      totalRegistered: registered.length,
      totalUnregistered: albionMembers.length - registered.length,
    };

    const membersReport = {
      initiates: [],
      squires: [],
      leadership: [],
      errors: [],
    };
    const membersSorted = registered.sort((a, b) => a.characterName.localeCompare(b.characterName));

    await message.edit('Starting report calculations...');

    let i = 0;
    for (const member of membersSorted) {
      i++;
      if (i % 10 === 0) {
        this.logger.log(`Calculating... (${i}/${registered.length})`);
        await message.edit(`Calculating... (${i}/${registered.length})`);
      }
      // Use date-fns to get the unix timestamp of the date the member was registered, so we can translate that into Discord time codes
      const unix = new Date(member.createdAt).getTime() / 1000;

      const discordDateCode = `<t:${unix}:f>`;
      const discordRelativeCode = `<t:${unix}:R>`;
      const discordMember = await this.discordService.getGuildMember(message.guildId, member.discordId);

      // Get their highest albion role
      const highestRole = this.albionUtilities.getHighestAlbionRole(discordMember);

      if (!highestRole) {
        const line = `- Unable to find highest Albion role for ${discordMember.displayName}!`;
        this.logger.warn(`Unable to find highest Albion role for ${discordMember.displayName}!`);
        membersReport.errors.push(line);
        continue;
      }

      const line = `- ${member.characterName} / <@${discordMember.id}>: Registered on ${discordDateCode} (${discordRelativeCode})`;

      // Push to the correct array based on the role
      switch (highestRole.name) {
        case '@ALB/US/Initiate':
          membersReport.initiates.push(line);
          break;
        case '@ALB/US/Squire':
          membersReport.squires.push(line);
          break;
        case '@ALB/US/Captain':
        case '@ALB/US/General':
        case '@ALB/US/Master':
        case '@ALB/US/Guildmaster':
          membersReport.leadership.push(line);
          break;
      }
    }

    const regPercent = Math.round((metrics.totalRegistered / metrics.totalMembers) * 100);
    const unregPercent = Math.round((metrics.totalUnregistered / metrics.totalMembers) * 100);

    await getChannel(message).send(`# Metrics \n🧑‍🤝‍🧑 Total Guild members: ${metrics.totalMembers}\n📝 Total registered: ${metrics.totalRegistered} (${regPercent}%)\nℹ️ Total unregistered: ${metrics.totalUnregistered} (${unregPercent}%)`);

    await getChannel(message).send(`# Initiates (${membersReport.initiates.length})`);
    if (membersReport.initiates.length > 0) {
      await this.bufferMessages(membersReport.initiates, message);
    }
    else {
      await getChannel(message).send('No Initiates found!');
    }
    await getChannel(message).send(`# Squires (${membersReport.squires.length})`);
    if (membersReport.squires.length > 0) {
      await this.bufferMessages(membersReport.squires, message);
    }
    else {
      await getChannel(message).send('No Squires found!');
    }
    await getChannel(message).send(`# Leadership (${membersReport.leadership.length})`);
    if (membersReport.leadership.length > 0) {
      await this.bufferMessages(membersReport.leadership, message);
    }
    else {
      await getChannel(message).send('No Leadership members found!');
    }

    if (membersReport.errors.length > 0) {
      await getChannel(message).send(`# Errors\n${membersReport.errors.join('\n')}`);
    }

    await message.delete();

    this.logger.log('Report generated');
  }

  async squireCandidates(message: Message) {
    this.logger.log('Squire Candidate Report started');

    await message.edit('Loading Registrations...');

    // Get all registered members from database
    const registered = await this.albionMembersRepository.findAll();

    await message.edit('Gathering Squires...');

    const membersSorted = registered.sort((a, b) => a.characterName.localeCompare(b.characterName));

    const membersReport = {
      candidates: [],
      errors: [],
    };

    for (const member of membersSorted) {
      const unix = new Date(member.createdAt).getTime() / 1000;
      const diffInDays = Math.floor((Date.now() - new Date(member.createdAt).getTime()) / 1000 / 60 / 60 / 24);

      const discordRelativeCode = `<t:${unix}:R>`;
      const discordMember = await this.discordService.getGuildMember(message.guildId, member.discordId);

      // Get their highest albion role
      const highestRole = this.albionUtilities.getHighestAlbionRole(discordMember);

      if (!highestRole) {
        const line = `- Unable to find highest Albion role for ${discordMember.displayName}!`;
        this.logger.warn(`Unable to find highest Albion role for ${discordMember.displayName}!`);
        membersReport.errors.push(line);
        continue;
      }

      if (highestRole.name === '@ALB/US/Initiate' && diffInDays >= 14) {
        membersReport.candidates.push(`- ${member.characterName} / <@${discordMember.id}> - registered ${discordRelativeCode}`);
      }
    }

    await getChannel(message).send('# Squire Candidates\nCandidates based on Initiates who have been registered for 14 days or more.');
    if (membersReport.candidates.length > 0) {
      await this.bufferMessages(membersReport.candidates, message);
    }
    else {
      await getChannel(message).send('No Candidates found!');
    }

    if (membersReport.errors.length > 0) {
      await getChannel(message).send('# Errors');
      await this.bufferMessages(membersReport.errors, message);
    }
    await message.delete();

    this.logger.log('Squire Candidate Report generated');
  }

  async bufferMessages(membersReportArray: string[], message: Message) {
    // We need to split the message up due to character limits. Split up each message into 10 initiates each message
    let count = 0;
    let messageBuffer = '';
    const messagesInBuffer = [];
    for (const initiate of membersReportArray) {
      count++;

      messageBuffer += `${initiate}\n`;

      if (count % 10 === 0 || count === membersReportArray.length) {
        messagesInBuffer.push(messageBuffer);
        messageBuffer = '';
      }
    }

    for (const bufferedMessage of messagesInBuffer) {
      this.logger.debug(`Sending buffered message: ${bufferedMessage}`);
      const sentMessage = await getChannel(message).send('---');
      await sentMessage.edit(bufferedMessage);
    }
  }
}
