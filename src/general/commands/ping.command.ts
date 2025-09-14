import { Command, Handler } from "@discord-nestjs/core";
import {
  ApplicationCommandType,
  ChatInputCommandInteraction,
} from "discord.js";
import { ConfigService } from "@nestjs/config";
import { Logger } from "@nestjs/common";

@Command({
  name: "ping",
  type: ApplicationCommandType.ChatInput,
  description: "Return a ping from the bot",
})
export class PingCommand {
  private readonly logger = new Logger(PingCommand.name);
  constructor(private readonly config: ConfigService) {}
  @Handler()
  async onPingCommand(interaction: ChatInputCommandInteraction): Promise<void> {
    const content = `Hello ${interaction.user.username}, I'm alive! Version: ${this.config.get("app.version")}`;

    await interaction.reply({
      content,
    });

    this.logger.log("Ping command executed!");
  }
}
