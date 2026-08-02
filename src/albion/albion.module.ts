import { Module } from '@nestjs/common';
import { AlbionRegisterCommand } from './commands/register.command';
import { AlbionApiService } from './services/albion.api.service';
import { DatabaseModule } from '../database/database.module';
import { ConfigModule } from '../config/config.module';
import { AlbionRegistrationService } from './services/albion.registration.service';
import { DiscordModule } from '../discord/discord.module';
import { AlbionScanningService } from './services/albion.scanning.service';
import { AlbionScanCommand } from './commands/scan.command';
import { AlbionCronService } from './services/albion.cron.service';
import { AlbionUtilities } from './utilities/albion.utilities';
import { AlbionLogCommand } from './commands/log.command';
import { AlbionDeregisterCommand } from './commands/deregistration.command';
import { AlbionDeregistrationService } from './services/albion.deregistration.service';
import { AlbionRegistrationRetryCronService } from './services/albion.registration.retry.cron.service';
import { AlbionForceRetryCommand } from './commands/force-retry.command';
import { AlbionForceRegisterCommand } from './commands/force-register.command';
import { AlbionForceRegistrationService } from './services/albion.force.registration.service';
import { AlbionRegisterQueueCommand } from './commands/register-queue.command';
import { AlbionRegistrationQueueService } from './services/albion.registration.queue.service';
import { AlbionRankUpCommand } from './commands/rank-up.command';
import { AlbionRankUpService } from './services/albion.rank.up.service';
import { AlbionRankProgressService } from './services/albion.rank.progress.service';
import { AlbionRankUpVoteService } from './services/albion.rank.up.vote.service';
import { AlbionRankUpVoteCronService } from './services/albion.rank.up.vote.cron.service';
import { GeneralModule } from '../general/general.module';

@Module({
  imports: [ConfigModule, DatabaseModule, DiscordModule, GeneralModule],
  providers: [
    AlbionApiService,
    AlbionCronService,
    AlbionDeregisterCommand,
    AlbionDeregistrationService,
    AlbionForceRegisterCommand,
    AlbionForceRegistrationService,
    AlbionLogCommand,
    AlbionRankProgressService,
    AlbionRankUpCommand,
    AlbionRankUpService,
    AlbionRankUpVoteCronService,
    AlbionRankUpVoteService,
    AlbionRegisterCommand,
    AlbionRegisterQueueCommand,
    AlbionForceRetryCommand,
    AlbionRegistrationQueueService,
    AlbionRegistrationRetryCronService,
    AlbionRegistrationService,
    // AlbionReportsCommand,
    // AlbionReportsService,
    AlbionScanCommand,
    AlbionScanningService,
    AlbionUtilities,
  ],
})
export class AlbionModule {}
