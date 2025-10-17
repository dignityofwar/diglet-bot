import { DiscordModule as DiscordJSModule } from "@discord-nestjs/core";
import { Module } from "@nestjs/common";
import { AlbionRegisterCommand } from "./commands/register.command";
import { AlbionApiService } from "./services/albion.api.service";
import { DatabaseModule } from "../database/database.module";
import { ConfigModule } from "../config/config.module";
import { AlbionRegistrationService } from "./services/albion.registration.service";
import { DiscordModule } from "../discord/discord.module";
import { AlbionScanningService } from "./services/albion.scanning.service";
import { AlbionScanCommand } from "./commands/scan.command";
import { AlbionCronService } from "./services/albion.cron.service";
import { AlbionReportsService } from "./services/albion.reports.service";
import { AlbionUtilities } from "./utilities/albion.utilities";
import { AlbionReportsCommand } from "./commands/reports.command";
import { AlbionLogCommand } from "./commands/log.command";
import { AlbionDeregisterCommand } from "./commands/deregistration.command";
import { AlbionDeregistrationService } from "./services/albion.deregistration.service";

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    DiscordJSModule.forFeature(),
    DiscordModule,
  ],
  providers: [
    AlbionApiService,
    AlbionCronService,
    AlbionDeregisterCommand,
    AlbionDeregistrationService,
    AlbionLogCommand,
    AlbionRegisterCommand,
    AlbionRegistrationService,
    AlbionReportsCommand,
    AlbionReportsService,
    AlbionScanCommand,
    AlbionScanningService,
    AlbionUtilities,
  ],
})
export class AlbionModule {}
