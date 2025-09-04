import { Module } from '@nestjs/common';
import { MikroOrmModule } from '@mikro-orm/nestjs';
import { PS2VerificationAttemptEntity } from './entities/ps2.verification.attempt.entity';
import { PS2MembersEntity } from './entities/ps2.members.entity';
import { AlbionRegistrationsEntity } from './entities/albion.registrations.entity';
import { DatabaseService } from './services/database.service';
import { ActivityEntity } from './entities/activity.entity';
import { ActivityStatisticsEntity } from './entities/activity.statistics.entity';
import { JoinerLeaverEntity } from './entities/joiner.leaver.entity';
import { JoinerLeaverStatisticsEntity } from './entities/joiner.leaver.statistics.entity';
import { RoleMetricsEntity } from './entities/role.metrics.entity';

@Module({
  imports: [
    MikroOrmModule.forRoot(),
    MikroOrmModule.forFeature({
      entities: [
        ActivityEntity,
        ActivityStatisticsEntity,
        AlbionRegistrationsEntity,
        JoinerLeaverEntity,
        JoinerLeaverStatisticsEntity,
        PS2MembersEntity,
        PS2VerificationAttemptEntity,
        RoleMetricsEntity,
      ],
    }),
  ],
  providers: [DatabaseService],
  exports: [MikroOrmModule, DatabaseService],
})
export class DatabaseModule {}
