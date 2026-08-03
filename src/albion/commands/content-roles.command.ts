import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlbionScanDto } from '../dto/albion.scan.dto';
import { AlbionContentRoleService } from '../services/albion.content.role.service';
import { replyTo } from '../../discord/discord.hacks';

@Injectable()
export class AlbionContentRolesCommand {
  private readonly logger = new Logger(AlbionContentRolesCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly albionContentRoleService: AlbionContentRoleService,
  ) {}

  @SlashCommand({
    name: 'albion-content-roles',
    description: 'Strip Albion content roles and ping reactions from members who are no longer registered',
  })
  async onAlbionContentRolesCommand(
    @Options() dto: AlbionScanDto,
    @Context() [interaction]: SlashCommandContext,
  ): Promise<string> {
    this.logger.debug('Received Albion Content Roles Command');
    // Fetching the member list and paging every reaction blows Discord's 3s reply window.
    await interaction.deferReply();
    const dryRun = dto.dryRun ?? false;

    const scanChannelId = this.config.get('discord.channels.albionScans');

    if (interaction.channelId !== scanChannelId) {
      return replyTo(interaction, `Please use the <#${scanChannelId}> channel to perform Scans.`);
    }

    const message = await interaction.channel.send('Starting Albion content role sweep...');

    this.albionContentRoleService.reconcile(message, dryRun);

    return replyTo(interaction, `Albion content role sweep initiated!${dryRun ? ' [DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]' : ''}`);
  }
}
