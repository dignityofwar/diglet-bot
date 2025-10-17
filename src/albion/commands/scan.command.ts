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
import { SlashCommandPipe } from "@discord-nestjs/common";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AlbionScanDto } from "../dto/albion.scan.dto";
import { AlbionScanningService } from "../services/albion.scanning.service";

@Command({
  name: "albion-scan",
  type: ApplicationCommandType.ChatInput,
  description:
    "Trigger a scan of verified DIG Guild members to ensure they're valid members",
})
@Injectable()
export class AlbionScanCommand {
  private readonly logger = new Logger(AlbionScanCommand.name);

  constructor(
    private readonly config: ConfigService,
    private readonly albionScanningService: AlbionScanningService,
  ) {}

  @Handler()
  async onAlbionScanCommand(
    @InteractionEvent(SlashCommandPipe) dto: AlbionScanDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<string> {
    this.logger.debug("Received Albion Scan Command");

    // Check if the command came from the correct channel ID
    const scanChannelId = this.config.get("discord.channels.albionScans");

    // Check if channel is correct
    if (interaction[0].channelId !== scanChannelId) {
      return `Please use the <#${scanChannelId}> channel to perform Scans.`;
    }

    const message = await interaction[0].channel.send(
      "Starting Albion Members scan...",
    );

    this.albionScanningService.startScan(message, dto.dryRun);

    return `Albion Scan initiated!${dto.dryRun ? " [DRY RUN, NO CHANGES WILL ACTUALLY BE PERFORMED]" : ""}`;
  }
}
