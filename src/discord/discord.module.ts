import { Module } from '@nestjs/common';

import { ConfigModule } from '../config/config.module';
import { DiscordService } from './discord.service';
import { GlobalCommandCleanupService } from './global.command.cleanup.service';

@Module({
  imports: [ConfigModule],
  providers: [DiscordService, GlobalCommandCleanupService],
  exports: [DiscordService],
})
export class DiscordModule {}
