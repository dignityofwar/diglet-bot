import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { TextChannel } from "discord.js";
import { ConfigService } from "@nestjs/config";
import { DiscordService } from "../../discord/discord.service";
import { PurgeService } from "./purge.service";

@Injectable()
export class PurgeCronService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PurgeCronService.name);
  private channel: TextChannel;

  constructor(
    private readonly discordService: DiscordService,
    private readonly config: ConfigService,
    private readonly purgeService: PurgeService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    this.logger.log("Initializing Purge Cron Service");

    const channelId = this.config.get("discord.channels.thanosSnaps");

    // Check if the channel exists
    this.channel = await this.discordService.getTextChannel(channelId);

    if (!this.channel) {
      throw new Error(`Could not find channel with ID ${channelId}`);
    }
    if (!this.channel.isTextBased()) {
      throw new Error(`Channel with ID ${channelId} is not a text channel`);
    }
  }

  // @Cron('0 18 * * *')
  async runPurge(): Promise<void> {
    this.logger.log("Running Purge Cron");
    const message = await this.channel.send("Starting daily purge scan...");
    await this.purgeService.startPurge(message, false);
  }
}
