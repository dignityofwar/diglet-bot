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
import { Logger } from "@nestjs/common";
import { PurgeService } from "../services/purge.service";
import { SlashCommandPipe } from "@discord-nestjs/common";
import { DryRunDto } from "../dto/dry.run.dto";

@Command({
  name: "thanos-snap",
  type: ApplicationCommandType.ChatInput,
  description: "Execute a purge of the DIG server.",
})
export class ThanosSnapCommand {
  private readonly logger = new Logger(ThanosSnapCommand.name);

  constructor(private readonly purgeService: PurgeService) {}

  @Handler()
  async onThanosSnapCommand(
    @InteractionEvent(SlashCommandPipe) dto: DryRunDto,
    @EventParams() interaction: ChatInputCommandInteraction[],
  ): Promise<void> {
    this.logger.log("Executing Thanos Snap Command");
    const channel = interaction[0].channel;
    await interaction[0].reply("I am... inevitable.");

    if (dto.dryRun) {
      await channel.send("## This is a dry run! No members will be kicked!");
    }

    const message = await channel.send(
      "https://media.giphy.com/media/ie76dJeem4xBDcf83e/giphy.gif",
    );

    this.purgeService.startPurge(message, dto.dryRun);
  }
}
