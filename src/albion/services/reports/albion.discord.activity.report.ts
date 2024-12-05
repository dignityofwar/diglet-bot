import { Injectable, Logger } from '@nestjs/common';
import { GuildTextBasedChannel, Interaction } from 'discord.js';
import { AlbionRegistrationsEntity } from '../../../database/entities/albion.registrations.entity';
import { InjectRepository } from '@mikro-orm/nestjs';
import { EntityRepository } from '@mikro-orm/core';
import { ActivityEntity } from '../../../database/entities/activity.entity';
import { DiscordService } from '../../../discord/discord.service';

export interface AlbionDiscordActivity {
  characterName: string;
  discordId: string;
  lastActivity: Date;
  registered: Date;
}

@Injectable()
export class AlbionDiscordActivityReport {
  private readonly logger = new Logger(AlbionDiscordActivityReport.name);

  constructor(
    @InjectRepository(AlbionRegistrationsEntity) private readonly albionRegistrationsRepository: EntityRepository<AlbionRegistrationsEntity>,
    @InjectRepository(ActivityEntity) private readonly activityRepository: EntityRepository<ActivityEntity>,
    private readonly discordService: DiscordService,
  ) {}

  async runReport(interaction: Interaction): Promise<void> {
    this.logger.log(`Running Albion Discord Activity Report requested by ${interaction.user.displayName}...`);
    await interaction.channel.send('Running Albion Discord Activity Report...');

    const registrants = await this.albionRegistrationsRepository.findAll();

    if (!registrants || registrants.length === 0) {
      this.logger.warn('No registrants found!');
      await interaction.channel.send('No registrants found!');
      return;
    }

    const memberActivityData = await this.getMemberActivity(registrants);

    await this.reportStart(memberActivityData, interaction.channel);
    await this.reportMembers(memberActivityData, interaction.channel);
    await interaction.channel.send('Report complete!');
    this.logger.log('Albion Discord Activity Report complete');
  }

  async getMemberActivity(registrants: AlbionRegistrationsEntity[]): Promise<AlbionDiscordActivity[]> {
    this.logger.log('Building member data');

    const memberActivityData: AlbionDiscordActivity[] = [];

    // Find each member's activity record from the ActivityRepository
    for (const registrant of registrants) {
      const activityRecord = await this.activityRepository.findOne({ discordId: registrant.discordId });
      if (!activityRecord) {
        this.logger.warn(`No activity record found for ${registrant.discordId}`);
        continue;
      }

      memberActivityData.push({
        characterName: registrant.characterName,
        discordId: registrant.discordId,
        lastActivity: activityRecord.lastActivity,
        registered: registrant.createdAt,
      });
    }

    return memberActivityData;
  }

  async reportStart(memberData: AlbionDiscordActivity[], channel: GuildTextBasedChannel): Promise<void> {
    this.logger.log('Formatting report');

    // Looks like this:
    /*
    # 📊 Albion Discord Activity Report
    - Total Registrants: **91**
    - Total DC Active Members (3d): **24**
    - Total DC Active Members (7d): **45**
    - Total DC Active Members (14d): **67**
    - Total DC Active Members (30d): **89**

    ## Member Activity
    ✅ = Active on Discord within the last 7 days\n`;
    - @Maelstrome (IGN: **Maelstromeous**) ✅ Active
      - Last Active on DC: 19 July 2024 (1 day ago) | Registered: 10 June 2024 (40 days ago)
     */

    const stats = `# 📊 Albion Discord Activity Report\n
- Total Registrants: **${memberData.length}**\n
- Total DC Active Members (3d): **${memberData.filter(member => member.lastActivity > new Date(Date.now() - 3 * 24 * 60 * 60 * 1000)).length}**\n
- Total DC Active Members (7d): **${memberData.filter(member => member.lastActivity > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)).length}**\n
- Total DC Active Members (14d): **${memberData.filter(member => member.lastActivity > new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)).length}**\n
- Total DC Active Members (30d): **${memberData.filter(member => member.lastActivity > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)).length}**\n
    
## Member Activity\n
✅ = Active on Discord within the last 7 days\n`;

    channel.send(stats);
  }

  async reportMembers(memberData: AlbionDiscordActivity[], channel: GuildTextBasedChannel): Promise<void> {
    const batchMessages: string[] = [];

    for (const member of memberData) {
      batchMessages.push(this.memberLines(member));
    }

    await this.discordService.batchSend(batchMessages, channel);
  }

  memberLines(member: AlbionDiscordActivity): string {
    const lastActivityUnix = member.lastActivity.getTime() / 1000;
    const lastActivityDateCode = `<t:${lastActivityUnix}:f>`;
    const lastActivityRelativeCode = `<t:${lastActivityUnix}:R>`;

    const registeredUnix = member.registered.getTime() / 1000;
    const registeredDateCode = `<t:${registeredUnix}:f>`;
    const registeredRelativeCode = `<t:${registeredUnix}:R>`;

    /* e.g.
    - @Maelstrome (IGN: **Maelstromeous**) ✅ Active
      - Last Active on DC: 19 July 2024 (0 days ago) | Registered: 10 June 2024 (1 month ago)
     */

    const now = new Date();

    // If more than 7 days inactive, consider inactive
    const isInactive = member.lastActivity < new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const considered = isInactive ? '🛑 Inactive' : '✅ Active';

    return `- @${member.discordId} (IGN: **${member.characterName}**) | ${considered}
  - Last Active on DC: ${lastActivityDateCode} (${lastActivityRelativeCode} | Registered: ${registeredDateCode} (${registeredRelativeCode})`;
  }
}
