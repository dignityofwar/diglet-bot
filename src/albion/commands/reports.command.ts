import {
  Command,
  EventParams,
  Handler,
  InteractionEvent,
} from "@discord-nestjs/core";
import {
  ApplicationCommandType,
  ChatInputCommandInteraction,
} from "discord.js";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AlbionReportsService } from "../services/albion.reports.service";
import { SlashCommandPipe } from "@discord-nestjs/common";
import { AlbionReportsDto } from "../dto/albion.reports.dto";

@Command({
  name: "albion-reports",
  type: ApplicationCommandType.ChatInput,
  description: "Run reports on the Albion Guild",
})
@Injectable()
export class AlbionReportsCommand {
  private readonly logger = new Logger(AlbionReportsCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly albionReportsService: AlbionReportsService,
  ) {}

  @Handler()
  async onAlbionReportsCommand(
    @InteractionEvent(SlashCommandPipe) dto: AlbionReportsDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<string> {
    this.logger.debug("Received Albion Reports Command");

    // Check if the command came from the correct channel ID
    const scanChannelId = this.config.get("discord.channels.albionScans");

    // Check if channel is correct
    if (interaction[0].channelId !== scanChannelId) {
      return `Please use the <#${scanChannelId}> channel to generate Reports.`;
    }

    const message = await interaction[0].channel.send(
      "Starting Albion Members Report...",
    );

    if (dto.fullReport) {
      this.albionReportsService.fullReport(message);
    }
    if (dto.squireCandidates) {
      this.albionReportsService.squireCandidates(message);
    }

    return "Albion Report Initiated...";
  }
}
