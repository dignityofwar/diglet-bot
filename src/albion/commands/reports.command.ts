// This command is now dead and it's not been asked for in ages. It's being kept here in case we need to resurrect it later.

// import { Context, Options, SlashCommand, SlashCommandContext } from 'necord';
// import { Injectable, Logger } from '@nestjs/common';
// import { ConfigService } from '@nestjs/config';
// import { AlbionReportsService } from '../services/albion.reports.service';
// import { AlbionReportsDto } from '../dto/albion.reports.dto';
// import { replyTo } from '../../discord/discord.hacks';
//
// @Injectable()
// export class AlbionReportsCommand {
//   private readonly logger = new Logger(AlbionReportsCommand.name);
//
//   constructor(
//     private readonly config: ConfigService,
//     private readonly albionReportsService: AlbionReportsService,
//   ) {}
//
//   @SlashCommand({
//     name: 'albion-reports',
//     description: 'Run reports on the Albion Guild',
//   })
//   async onAlbionReportsCommand(
//     @Options() dto: AlbionReportsDto,
//     @Context() [interaction]: SlashCommandContext,
//   ): Promise<string> {
//     this.logger.debug('Received Albion Reports Command');
//
//     // Check if the command came from the correct channel ID
//     const scanChannelId = this.config.get('discord.channels.albionScans');
//
//     // Check if channel is correct
//     if (interaction.channelId !== scanChannelId) {
//       return replyTo(interaction, `Please use the <#${scanChannelId}> channel to generate Reports.`);
//     }
//
//     const message = await interaction.channel.send('Starting Albion Members Report...');
//
//     if (dto.fullReport) {
//       this.albionReportsService.fullReport(message);
//     }
//     if (dto.squireCandidates) {
//       this.albionReportsService.squireCandidates(message);
//     }
//
//     return replyTo(interaction, 'Albion Report Initiated...');
//   }
// }
