import { Logger } from '@nestjs/common';
import { InjectRepository } from '@mikro-orm/nestjs';
import { AlbionMembersEntity } from '../../database/entities/albion.members.entity';
import { EntityRepository } from '@mikro-orm/core';
import { DiscordService } from '../../discord/discord.service';
import { ConfigService } from '@nestjs/config';
import { AlbionUtilities } from '../utilities/albion.utilities';
import { Message } from 'discord.js';
import { AlbionApiService } from './albion.api.service';
import { AlbionPlayerInterface } from '../interfaces/albion.api.interfaces';

export class AlbionReportsService {
  private readonly logger = new Logger(AlbionReportsService.name);

  constructor(
    @InjectRepository(AlbionMembersEntity) private readonly albionMembersRepository: EntityRepository<AlbionMembersEntity>,
    private readonly config: ConfigService,
    private readonly discordService: DiscordService,
    private readonly albionApiService: AlbionApiService,
    private readonly albionUtilities: AlbionUtilities
  ) {}

  async getRegistrationReport(message: Message) {
    await message.edit('Getting Guild members from the API...');

    // Get total number of members with the Albion Online role
    let albionMembers: AlbionPlayerInterface[] = [];

    try {
      albionMembers = await this.albionApiService.getAllGuildMembers(this.config.get('albion.guildId'));
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
      squire: [],
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
      const discordMember = await this.discordService.getGuildMemberFromId(message.guildId, member.discordId);

      // Get their highest albion role
      const highestRole = this.albionUtilities.getHighestAlbionRole(discordMember);

      if (!highestRole) {
        const line = `- Unable to find highest Albion role for ${discordMember.displayName}!`;
        this.logger.warn(`Unable to find highest Albion role for ${discordMember.displayName}!`);
        membersReport.errors.push(line);
        continue;
      }

      const line = `- ${member.characterName}: Registered on ${discordDateCode} (${discordRelativeCode})`;

      // Push to the correct array based on the role
      switch (highestRole.name) {
        case '@ALB/Initiate':
          membersReport.initiates.push(line);
          break;
        case '@ALB/Squire':
          membersReport.squire.push(line);
          break;
        case '@ALB/Captain':
        case '@ALB/General':
        case '@ALB/Master':
        case '@ALB/Guildmaster':
          membersReport.leadership.push(line);
          break;
      }
    }

    const regPercent = Math.round((metrics.totalRegistered / metrics.totalMembers) * 100);
    const unregPercent = Math.round((metrics.totalUnregistered / metrics.totalMembers) * 100);

    const fields = [
      {
        name: 'Metrics',
        value: `🧑‍🤝‍🧑 Total Guild members: ${metrics.totalMembers}\n📝 Total registered: ${metrics.totalRegistered} (${regPercent}%)\nℹ️ Total unregistered: ${metrics.totalUnregistered} (${unregPercent}%)`,
      },
      {
        name: 'Initiates',
        value: membersReport.initiates.length > 0 ? membersReport.initiates.join('\n -') : 'No initiates found',
      },
      {
        name: 'Squires',
        value: membersReport.squire.length > 0 ? membersReport.squire.join('\n -') : 'No squires found',
      },
      {
        name: 'Leadership',
        value: membersReport.leadership.length > 0 ? membersReport.leadership.join('\n -') : 'No leadership found',
      },
    ];

    if (membersReport.errors.length > 0) {
      fields.push({
        name: 'Errors',
        value: membersReport.errors.join('\n -'),
      });
    }

    await message.channel.send({
      embeds: [
        {
          title: 'Albion Registration Report',
          description: `This report was generated on <t:${Math.floor(Date.now() / 1000)}:f> (<t:${Math.floor(Date.now() / 1000)}:R>)`,
          fields,
        },
      ],
    });

    await message.delete();

    this.logger.log('Report generated');
  }
}
