import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { GuildMember } from 'discord.js';
import { ActivityDto } from '../dto/activity.dto';
import { MemberActivityReportService } from '../services/member.activity.report.service';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class ActivityCommand {
  private readonly logger = new Logger(ActivityCommand.name);

  constructor(
    private readonly memberActivityReportService: MemberActivityReportService,
  ) {}

  @SlashCommand({
    name: 'activity',
    description: 'Show a member\'s activity record and game activity summary.',
  })
  async onActivityCommand(
    @Options() dto: ActivityDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.log(`Received Activity Command for ${dto.member.id}`);

    // Deliberately public - the whole point is that the report is visible to the channel.
    // Deferred because the report hits the database several times, which blows Discord's 3s window.
    await interaction.deferReply();

    // A leaver still has an activity record worth reading, so a missing member is not an error
    let member: GuildMember | null = null;

    try {
      member = await interaction.guild?.members.fetch(dto.member.id) ?? null;
    }
    catch {
      this.logger.log(`${dto.member.id} is not a member of the guild, reporting without server context`);
    }

    try {
      const [summary, ...rest] = await this.memberActivityReportService.buildReport(dto.member, member);

      await replyTo(interaction, summary);

      // Each message carries its own 2000 character budget, so the game list can't cost
      // the summary its place. Sent in order rather than in parallel.
      for (const message of rest) {
        await interaction.followUp(message);
      }

      return summary;
    }
    catch (err) {
      this.logger.error(err.message);
      return replyTo(interaction, `⛔️ **ERROR:** Could not build the activity report. Err: ${err.message}`);
    }
  }
}
